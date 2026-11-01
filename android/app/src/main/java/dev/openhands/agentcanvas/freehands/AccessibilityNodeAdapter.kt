package dev.openhands.agentcanvas.freehands

import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Adapts a framework [AccessibilityNodeInfo] to [UiNodeSource].
 *
 * Recycling: on API 33 and above `recycle()` is a no-op and nodes are not
 * pooled, so the adapter only recycles the child nodes it creates. Callers
 * should not hold an adapter (or its children) beyond the frame in which the
 * tree was captured.
 */
class AccessibilityNodeAdapter(private val node: AccessibilityNodeInfo) : UiNodeSource {

    private val rect = Rect()

    override val className: String get() = node.className?.toString().orEmpty()

    override val text: String? get() = node.text?.toString()

    override val contentDescription: String? get() = node.contentDescription?.toString()

    override val clickable: Boolean get() = node.isClickable

    override val scrollable: Boolean get() = node.isScrollable

    override val editable: Boolean get() = node.isEditable

    override val enabled: Boolean get() = node.isEnabled

    override val focused: Boolean get() = node.isFocused

    override val bounds: NodeBounds
        get() {
            node.getBoundsInScreen(rect)
            return NodeBounds(rect.left, rect.top, rect.right, rect.bottom)
        }

    override val childCount: Int get() = node.childCount

    override val viewId: String?
        get() = node.viewIdResourceName

    override fun child(index: Int): UiNodeSource? {
        val child = node.getChild(index) ?: return null
        return AccessibilityNodeAdapter(child)
    }
}
