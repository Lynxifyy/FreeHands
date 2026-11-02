package dev.openhands.agentcanvas.freehands

import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.locks.ReentrantLock

/** Performs one action on the device. Backed by the accessibility service. */
fun interface ActionExecutor {
    fun execute(action: AgentAction): ActionResult
}

/** Notified on the dispatcher's worker thread when an action finishes. */
fun interface ActionResultListener {
    fun onResult(action: AgentAction, result: ActionResult)
}

/**
 * Serialises agent actions onto a worker thread.
 *
 * The agent loop runs off the UI thread and must never block it, so [submit] is
 * non-blocking: it enqueues and returns. A single worker thread drains the
 * queue in order, which is required because device actions are stateful (a tap
 * must land before the text that follows it). A bounded queue keeps a runaway
 * agent from growing memory: when full, [submit] refuses the action and counts
 * a drop rather than blocking the caller.
 *
 * Every action passes the [PermissionMatrix] at execution time, not at submit
 * time, so lowering the tier takes effect immediately for queued work.
 */
class ActionDispatcher(
    private val executor: ActionExecutor,
    private val permissionProvider: () -> PermissionTier = { PermissionTier.FULL_AUTO },
    private val confirmationHandler: ((AgentAction) -> Boolean)? = null,
    private val recorder: SessionRecorder? = null,
    private val rateLimiter: RateLimiter? = null,
    capacity: Int = DEFAULT_CAPACITY,
) : AutoCloseable {

    private data class QueuedAction(val action: AgentAction, val listener: ActionResultListener?)

    private val queue = LinkedBlockingQueue<QueuedAction>(capacity.coerceAtLeast(1))
    private val lock = ReentrantLock()
    private val idle = lock.newCondition()
    private val outstanding = AtomicInteger(0)
    private val submittedCount = AtomicLong()
    private val processedCount = AtomicLong()
    private val deniedCount = AtomicLong()
    private val failedCount = AtomicLong()
    private val droppedCount = AtomicLong()

    @Volatile
    private var running = false
    private var worker: Thread? = null

    val capacity: Int get() = queue.remainingCapacity() + queue.size

    val pending: Int get() = queue.size

    val submitted: Long get() = submittedCount.get()

    val processed: Long get() = processedCount.get()

    val denied: Long get() = deniedCount.get()

    val failed: Long get() = failedCount.get()

    val dropped: Long get() = droppedCount.get()

    val isRunning: Boolean get() = running

    /** Starts the worker thread. Idempotent. */
    @Synchronized
    fun start() {
        if (running) return
        check(worker?.isAlive != true) { "Previous device action is still shutting down" }
        running = true
        worker = Thread({ drainLoop() }, "freehands-actions").apply {
            isDaemon = true
            start()
        }
    }

    /**
     * Enqueues [action] for execution. Returns false when the queue is full or
     * the dispatcher is not running; the caller may retry.
     */
    @Synchronized
    fun submit(action: AgentAction, listener: ActionResultListener? = null): Boolean {
        if (!running) return false
        val queued = QueuedAction(action, listener)
        if (!queue.offer(queued)) {
            droppedCount.incrementAndGet()
            return false
        }
        outstanding.incrementAndGet()
        submittedCount.incrementAndGet()
        return true
    }

    /** Blocks until the queue is drained and the current action finished. */
    fun awaitIdle(timeoutMs: Long = DEFAULT_IDLE_TIMEOUT_MS): Boolean {
        lock.lock()
        try {
            val deadline = System.nanoTime() + timeoutMs * 1_000_000
            while (outstanding.get() > 0) {
                val remaining = deadline - System.nanoTime()
                if (remaining <= 0) return false
                idle.awaitNanos(remaining)
            }
            return true
        } finally {
            lock.unlock()
        }
    }

    /** Stops the worker, discarding queued actions. Idempotent. */
    @Synchronized
    override fun close() {
        running = false
        val discarded = mutableListOf<QueuedAction>()
        queue.drainTo(discarded)
        outstanding.addAndGet(-discarded.size)
        worker?.interrupt()
        signalIdle()
        for (queued in discarded) {
            try {
                queued.listener?.onResult(queued.action, ActionResult.Failed("Action cancelled: dispatcher closed"))
            } catch (_: Exception) { /* Observer failure must not block shutdown. */ }
        }
    }

    private fun drainLoop() {
        while (running) {
            val queued = try {
                queue.take()
            } catch (interrupted: InterruptedException) {
                Thread.currentThread().interrupt()
                return
            }
            try {
                dispatch(queued)
            } finally {
                outstanding.decrementAndGet()
                signalIdle()
            }
        }
    }

    private fun dispatch(queued: QueuedAction) {
        val action = queued.action
        val result = evaluate(action)
        processedCount.incrementAndGet()
        when (result) {
            is ActionResult.Denied -> deniedCount.incrementAndGet()
            is ActionResult.Failed -> failedCount.incrementAndGet()
            ActionResult.Success -> Unit
        }
        try {
            recorder?.recordAction(action, result)
        } catch (_: Exception) {
            // Audit storage must not prevent the agent from learning the outcome.
        }
        try {
            queued.listener?.onResult(action, result)
        } catch (_: Exception) {
            // A cancelled observer must not kill the serial action worker.
        }
    }

    private fun evaluate(action: AgentAction): ActionResult = try {
        evaluatePermitted(action)
    } catch (error: Exception) {
        ActionResult.Failed(error.message ?: "Device action failed: ${error.javaClass.simpleName}")
    }

    private fun evaluatePermitted(action: AgentAction): ActionResult {
        rateLimiter?.let { limiter ->
            if (!limiter.tryAcquire()) {
                return ActionResult.Denied("Rate limit reached; try again shortly")
            }
        }
        return when (val decision = PermissionMatrix.decide(permissionProvider(), action)) {
            is PermissionDecision.Allowed -> executor.execute(action)
            is PermissionDecision.Denied -> ActionResult.Denied(decision.reason)
            is PermissionDecision.RequiresConfirmation -> {
                val approved = confirmationHandler?.invoke(action) ?: false
                if (approved) {
                    // Permission may have been revoked while the user was deciding.
                    val current = PermissionMatrix.decide(permissionProvider(), action)
                    if (current is PermissionDecision.Allowed || current is PermissionDecision.RequiresConfirmation) {
                        executor.execute(action)
                    } else ActionResult.Denied("Permission changed while awaiting confirmation")
                } else {
                    ActionResult.Denied("Confirmation declined for ${action.description}")
                }
            }
        }
    }

    private fun signalIdle() {
        lock.lock()
        try {
            idle.signalAll()
        } finally {
            lock.unlock()
        }
    }

    companion object {
        const val DEFAULT_CAPACITY = 64
        const val DEFAULT_IDLE_TIMEOUT_MS = 5000L
    }
}
