package dev.openhands.agentcanvas.freehands

import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ActionDispatcherTest {

    private val executed = CopyOnWriteArrayList<AgentAction>()

    private fun executor(fail: Boolean = false) = ActionExecutor { action ->
        executed += action
        if (fail) ActionResult.Failed("boom") else ActionResult.Success
    }

    @Test
    fun `executes submitted actions in order`() {
        val dispatcher = ActionDispatcher(executor())
        dispatcher.start()

        dispatcher.submit(AgentAction.Tap(1, 1))
        dispatcher.submit(AgentAction.Tap(2, 2))
        dispatcher.submit(AgentAction.Back)

        assertTrue(dispatcher.awaitIdle(2000))
        assertEquals(3, executed.size)
        assertEquals(AgentAction.Tap(1, 1), executed[0])
        assertEquals(AgentAction.Back, executed[2])
        assertEquals(3L, dispatcher.processed)
        dispatcher.close()
    }

    @Test
    fun `refuses submissions before start and after close`() {
        val dispatcher = ActionDispatcher(executor())
        assertFalse(dispatcher.submit(AgentAction.Back))

        dispatcher.start()
        assertTrue(dispatcher.submit(AgentAction.Back))
        assertTrue(dispatcher.awaitIdle(2000))

        dispatcher.close()
        assertFalse(dispatcher.submit(AgentAction.Back))
    }

    @Test
    fun `refuses actions when the queue is full and counts drops`() {
        val gate = CountDownLatch(1)
        val started = CountDownLatch(1)
        val dispatcher = ActionDispatcher(
            executor = ActionExecutor {
                started.countDown()
                gate.await(2, TimeUnit.SECONDS)
                ActionResult.Success
            },
            capacity = 1,
        )
        dispatcher.start()

        assertTrue(dispatcher.submit(AgentAction.Wait(1)))
        // Wait until the worker has taken the first action, so the queue below
        // is deterministically full rather than racing the worker.
        assertTrue(started.await(2, TimeUnit.SECONDS))
        assertTrue(dispatcher.submit(AgentAction.Wait(1)))
        assertFalse(dispatcher.submit(AgentAction.Wait(1)))

        assertEquals(1L, dispatcher.dropped)
        gate.countDown()
        assertTrue(dispatcher.awaitIdle(2000))
        dispatcher.close()
    }

    @Test
    fun `denies actions not permitted by the current tier`() {
        val dispatcher = ActionDispatcher(
            executor = executor(),
            permissionProvider = { PermissionTier.READ_ONLY },
        )
        dispatcher.start()

        dispatcher.submit(AgentAction.Tap(5, 5))

        assertTrue(dispatcher.awaitIdle(2000))
        assertTrue(executed.isEmpty())
        assertEquals(1L, dispatcher.denied)
        dispatcher.close()
    }

    @Test
    fun `reads the tier at execution time so a downgrade applies to queued work`() {
        var tier = PermissionTier.FULL_AUTO
        val dispatcher = ActionDispatcher(
            executor = executor(),
            permissionProvider = { tier },
        )
        dispatcher.start()
        tier = PermissionTier.READ_ONLY

        dispatcher.submit(AgentAction.Tap(5, 5))

        assertTrue(dispatcher.awaitIdle(2000))
        assertTrue(executed.isEmpty())
        dispatcher.close()
    }

    @Test
    fun `asks for confirmation and runs when approved`() {
        val prompts = AtomicInteger()
        val dispatcher = ActionDispatcher(
            executor = executor(),
            permissionProvider = { PermissionTier.ASSISTED },
            confirmationHandler = {
                prompts.incrementAndGet()
                true
            },
        )
        dispatcher.start()

        dispatcher.submit(AgentAction.TypeText("hi"))

        assertTrue(dispatcher.awaitIdle(2000))
        assertEquals(1, prompts.get())
        assertEquals(1, executed.size)
        dispatcher.close()
    }

    @Test
    fun `denies when the confirmation is declined`() {
        val dispatcher = ActionDispatcher(
            executor = executor(),
            permissionProvider = { PermissionTier.ASSISTED },
            confirmationHandler = { false },
        )
        dispatcher.start()

        dispatcher.submit(AgentAction.TypeText("hi"))

        assertTrue(dispatcher.awaitIdle(2000))
        assertTrue(executed.isEmpty())
        assertEquals(1L, dispatcher.denied)
        dispatcher.close()
    }

    @Test
    fun `denies when a confirmation is required but no handler exists`() {
        val dispatcher = ActionDispatcher(
            executor = executor(),
            permissionProvider = { PermissionTier.ASSISTED },
        )
        dispatcher.start()

        dispatcher.submit(AgentAction.TypeText("hi"))

        assertTrue(dispatcher.awaitIdle(2000))
        assertTrue(executed.isEmpty())
        dispatcher.close()
    }

    @Test
    fun `applies the rate limiter`() {
        val dispatcher = ActionDispatcher(
            executor = executor(),
            rateLimiter = RateLimiter(maxActions = 1, windowMs = 60_000),
        )
        dispatcher.start()

        dispatcher.submit(AgentAction.Tap(1, 1))
        dispatcher.submit(AgentAction.Tap(2, 2))

        assertTrue(dispatcher.awaitIdle(2000))
        assertEquals(1, executed.size)
        assertEquals(1L, dispatcher.denied)
        dispatcher.close()
    }

    @Test
    fun `reports failures`() {
        val dispatcher = ActionDispatcher(executor(fail = true))
        dispatcher.start()

        dispatcher.submit(AgentAction.Back)

        assertTrue(dispatcher.awaitIdle(2000))
        assertEquals(1L, dispatcher.failed)
        dispatcher.close()
    }

    @Test
    fun `notifies the listener with the action and result`() {
        val dispatcher = ActionDispatcher(executor())
        dispatcher.start()
        var observed: Pair<AgentAction, ActionResult>? = null
        val latch = CountDownLatch(1)

        dispatcher.submit(AgentAction.Tap(3, 4)) { action, result ->
            observed = action to result
            latch.countDown()
        }

        assertTrue(latch.await(2, TimeUnit.SECONDS))
        assertEquals(AgentAction.Tap(3, 4), observed!!.first)
        assertEquals(ActionResult.Success, observed!!.second)
        dispatcher.close()
    }

    @Test
    fun `awaitIdle times out when work never drains`() {
        val gate = CountDownLatch(1)
        val dispatcher = ActionDispatcher(
            executor = ActionExecutor {
                gate.await(5, TimeUnit.SECONDS)
                ActionResult.Success
            },
        )
        dispatcher.start()
        dispatcher.submit(AgentAction.Wait(1))

        assertFalse(dispatcher.awaitIdle(50))

        gate.countDown()
        dispatcher.close()
    }

    @Test
    fun `close discards queued work`() {
        val gate = CountDownLatch(1)
        val dispatcher = ActionDispatcher(
            executor = ActionExecutor {
                gate.await(2, TimeUnit.SECONDS)
                ActionResult.Success
            },
        )
        dispatcher.start()
        dispatcher.submit(AgentAction.Wait(1))
        dispatcher.submit(AgentAction.Wait(1))

        dispatcher.close()

        gate.countDown()
        assertFalse(dispatcher.isRunning)
    }
}
