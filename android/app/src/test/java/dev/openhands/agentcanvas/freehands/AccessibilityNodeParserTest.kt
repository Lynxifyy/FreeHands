package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Test double for the accessibility node interface. */
private class FakeNode(
    override val className: String = "android.widget.FrameLayout",
    override val text: String? = null,
    override val contentDescription: String? = null,
    override val clickable: Boolean = false,
    override val scrollable: Boolean = false,
    override val editable: Boolean = false,
    override val enabled: Boolean = true,
    override val focused: Boolean = false,
    override val bounds: NodeBounds = NodeBounds(0, 0, 100, 100),
    override val viewId: String? = null,
    private val children: List<UiNodeSource> = emptyList(),
) : UiNodeSource {
    override val childCount: Int get() = children.size

    override fun child(index: Int): UiNodeSource? = children.getOrNull(index)
}

class AccessibilityNodeParserTest {

    @Test
    fun `maps nodes with bounds and actionability`() {
        val root = FakeNode(
            className = "android.widget.LinearLayout",
            viewId = "root",
            children = listOf(
                FakeNode(
                    className = "android.widget.Button",
                    text = "Sign in",
                    clickable = true,
                    bounds = NodeBounds(10, 20, 110, 80),
                    viewId = "sign-in",
                ),
            ),
        )

        val parsed = AccessibilityNodeParser().parse(root)!!

        assertEquals(2, parsed.flatten().size)
        val button = parsed.children.single()
        assertEquals("Sign in", button.label)
        assertEquals(10, button.bounds.left)
        assertEquals(60, button.bounds.centerX)
        assertEquals(50, button.bounds.centerY)
        assertTrue(button.actionable)
    }

    @Test
    fun `prefers text over content description for the label`() {
        val node = FakeNode(text = "Visible", contentDescription = "Spoken", clickable = true)

        val parsed = AccessibilityNodeParser().parse(node)!!

        assertEquals("Visible", parsed.label)
    }

    @Test
    fun `falls back to content description when text is blank`() {
        val node = FakeNode(text = "   ", contentDescription = "Spoken", clickable = true)

        val parsed = AccessibilityNodeParser().parse(node)!!

        assertEquals("Spoken", parsed.label)
    }

    @Test
    fun `drops empty leaves that carry nothing`() {
        val root = FakeNode(
            viewId = "root",
            children = listOf(
                FakeNode(bounds = NodeBounds.EMPTY, viewId = "spacer"),
                FakeNode(text = "Real", clickable = true, viewId = "real"),
            ),
        )

        val parsed = AccessibilityNodeParser().parse(root)!!

        assertEquals(listOf("Real"), parsed.children.map { it.label })
    }

    @Test
    fun `keeps a container with no label when it has actionable children`() {
        val root = FakeNode(
            bounds = NodeBounds.EMPTY,
            viewId = "container",
            children = listOf(FakeNode(text = "Child", clickable = true, viewId = "child")),
        )

        val parsed = AccessibilityNodeParser().parse(root)!!

        assertEquals("container", parsed.id)
        assertEquals(1, parsed.children.size)
    }

    @Test
    fun `honours the node budget`() {
        val children = (1..50).map { FakeNode(text = "node $it", clickable = true, viewId = "n$it") }
        val root = FakeNode(viewId = "root", children = children)

        val parsed = AccessibilityNodeParser(maxNodes = 10).parse(root)!!

        assertTrue(parsed.flatten().size <= 10)
    }

    @Test
    fun `honours the depth budget`() {
        var node: UiNodeSource = FakeNode(text = "deep", clickable = true, viewId = "leaf")
        repeat(5) { depth ->
            node = FakeNode(viewId = "level-$depth", children = listOf(node))
        }
        val root = node

        val parsed = AccessibilityNodeParser(maxDepth = 2).parse(root)!!

        assertTrue(parsed.flatten().all { it.depth <= 2 })
    }

    @Test
    fun `finds a node by text ignoring case`() {
        val root = AccessibilityNodeParser().parse(
            FakeNode(
                viewId = "root",
                children = listOf(
                    FakeNode(text = "Cancel", clickable = true, viewId = "cancel"),
                    FakeNode(text = "Continue", clickable = true, viewId = "continue"),
                ),
            ),
        )!!

        val found = AccessibilityNodeParser.findByText(root, "cont")

        assertEquals("continue", found?.id)
    }

    @Test
    fun `returns no match when the text is absent`() {
        val root = AccessibilityNodeParser().parse(
            FakeNode(text = "Cancel", clickable = true, viewId = "cancel"),
        )!!

        assertNull(AccessibilityNodeParser.findByText(root, "missing"))
    }

    @Test
    fun `lists actionable nodes in reading order`() {
        val root = AccessibilityNodeParser().parse(
            FakeNode(
                viewId = "root",
                children = listOf(
                    FakeNode(text = "Label", viewId = "label"),
                    FakeNode(text = "First", clickable = true, viewId = "first"),
                    FakeNode(text = "Second", editable = true, viewId = "second"),
                    FakeNode(text = "Disabled", clickable = true, enabled = false, viewId = "disabled"),
                ),
            ),
        )!!

        val actionable = AccessibilityNodeParser.actionableNodes(root).map { it.id }

        assertEquals(listOf("first", "second"), actionable)
    }

    @Test
    fun `node bounds report empty for zero size`() {
        assertTrue(NodeBounds(10, 10, 10, 40).isEmpty)
        assertFalse(NodeBounds(10, 10, 20, 40).isEmpty)
    }

    @Test
    fun `node bounds contains only interior points`() {
        val bounds = NodeBounds(0, 0, 10, 10)

        assertTrue(bounds.contains(0, 0))
        assertTrue(bounds.contains(9, 9))
        assertFalse(bounds.contains(10, 10))
        assertFalse(bounds.contains(-1, 5))
    }
}
