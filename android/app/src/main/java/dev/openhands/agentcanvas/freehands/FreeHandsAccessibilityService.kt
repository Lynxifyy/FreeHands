package dev.openhands.agentcanvas.freehands

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * The device side of the agent: reads the accessibility tree and performs
 * gestures.
 *
 * Android only allows taps, swipes and long-presses through a user-enabled
 * accessibility service, and only allows reading other apps' UI through the
 * same service, so this class is the single privileged component. It exposes a
 * small, explicit API ([captureTree], [execute]) and holds no agent logic: the
 * dispatcher and permission matrix decide what runs.
 */
class FreeHandsAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        recorder?.record(SessionRecorder.EVENT_SERVICE_START)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Events drive nothing by themselves; the agent polls the tree when it
        // needs an observation. Reacting here would wake the agent on every
        // scroll tick of every app.
    }

    override fun onInterrupt() {
        // Required override; no long-running request to cancel.
    }

    override fun onDestroy() {
        recorder?.record(SessionRecorder.EVENT_SERVICE_STOP)
        instance = null
        super.onDestroy()
    }

    /** The live service, or null when the user has not enabled it. */
    val isConnected: Boolean get() = instance != null

    /**
     * Captures the current window's accessibility tree as a [UiNode] tree.
     * Returns null when the tree is unavailable (no window, or the service was
     * disabled between the check and the call).
     */
    fun captureTree(): UiNode? {
        val root: AccessibilityNodeInfo = rootInActiveWindow ?: return null
        return AccessibilityNodeParser().parse(AccessibilityNodeAdapter(root))
    }

    /**
     * Package name of the window in the foreground, or "" when it cannot be
     * determined. The agent uses it to describe which app it is looking at.
     */
    fun frontPackage(): String {
        val root = rootInActiveWindow ?: return ""
        return root.packageName?.toString().orEmpty()
    }

    /**
     * Performs [action] on the device. Gestures are asynchronous; this returns
     * once the gesture has been dispatched, and the caller verifies the effect
     * by watching frames.
     */
    fun execute(action: AgentAction): ActionResult = when (action) {
        is AgentAction.Tap -> dispatchGesture(buildTapPath(action.x, action.y), TAP_DURATION_MS)
        is AgentAction.TapNode -> {
            val node = findNodeById(action.nodeId)
            if (node != null && performClick(node)) {
                ActionResult.Success
            } else {
                dispatchGesture(buildTapPath(action.bounds.centerX, action.bounds.centerY), TAP_DURATION_MS)
            }
        }
        is AgentAction.LongPress ->
            dispatchGesture(buildTapPath(action.x, action.y), action.durationMs)
        is AgentAction.Swipe -> dispatchSwipe(action)
        is AgentAction.Back -> global(ACTION_BACK)
        is AgentAction.Home -> global(ACTION_HOME)
        is AgentAction.TypeText -> typeText(action.text)
        is AgentAction.Scroll -> scroll(action)
        is AgentAction.Wait -> {
            Thread.sleep(action.durationMs)
            ActionResult.Success
        }
    }

    private fun global(action: Int): ActionResult {
        val ok = performGlobalAction(action)
        return if (ok) ActionResult.Success else ActionResult.Failed("global action $action refused")
    }

    private fun typeText(text: String): ActionResult {
        val root = rootInActiveWindow ?: return ActionResult.Failed("no active window")
        val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            ?: return ActionResult.Failed("no focused input field")
        val arguments = android.os.Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        val ok = focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
        return if (ok) ActionResult.Success else ActionResult.Failed("set-text refused by the field")
    }

    private fun scroll(action: AgentAction.Scroll): ActionResult {
        val node = findNodeById(action.nodeId) ?: return ActionResult.Failed("node ${action.nodeId} not found")
        val accessibilityAction = when (action.direction) {
            ScrollDirection.FORWARD, ScrollDirection.DOWN, ScrollDirection.RIGHT ->
                AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
            ScrollDirection.BACKWARD, ScrollDirection.UP, ScrollDirection.LEFT ->
                AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
        }
        val ok = node.performAction(accessibilityAction)
        return if (ok) ActionResult.Success else ActionResult.Failed("scroll refused by ${action.nodeId}")
    }

    private fun performClick(node: AccessibilityNodeInfo): Boolean {
        var current: AccessibilityNodeInfo? = node
        while (current != null) {
            if (current.isClickable && current.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                return true
            }
            current = current.parent
        }
        return false
    }

    private fun findNodeById(id: String): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        return findByIdRecursive(root, id)
    }

    private fun findByIdRecursive(node: AccessibilityNodeInfo, id: String): AccessibilityNodeInfo? {
        val viewId = node.viewIdResourceName
        if (viewId != null && viewId == id) {
            return node
        }
        for (index in 0 until node.childCount) {
            val child = node.getChild(index) ?: continue
            findByIdRecursive(child, id)?.let { return it }
        }
        return null
    }

    private fun dispatchSwipe(action: AgentAction.Swipe): ActionResult {
        val path = Path().apply {
            moveTo(action.fromX.toFloat(), action.fromY.toFloat())
            lineTo(action.toX.toFloat(), action.toY.toFloat())
        }
        return dispatchGesture(path, action.durationMs)
    }

    private fun dispatchGesture(path: Path, durationMs: Long): ActionResult {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            return ActionResult.Failed("gesture dispatch requires Android 7.0+")
        }
        val stroke = GestureDescription.StrokeDescription(path, 0, durationMs.coerceAtLeast(1))
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        val dispatched = dispatchGesture(gesture, null, null)
        return if (dispatched) ActionResult.Success else ActionResult.Failed("gesture dispatch refused")
    }

    private fun buildTapPath(x: Int, y: Int): Path = Path().apply {
        moveTo(x.toFloat(), y.toFloat())
    }

    companion object {
        const val ACTION_BACK = GLOBAL_ACTION_BACK
        const val ACTION_HOME = GLOBAL_ACTION_HOME
        const val TAP_DURATION_MS = 60L

        @Volatile
        private var instance: FreeHandsAccessibilityService? = null

        @Volatile
        var recorder: SessionRecorder? = null

        /** The connected service, or null when the user has not enabled it. */
        fun current(): FreeHandsAccessibilityService? = instance

        fun isEnabled(): Boolean = instance != null
    }
}
