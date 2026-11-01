package dev.openhands.agentcanvas.freehands

/** Screen-space rectangle in device pixels. */
data class NodeBounds(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
) {
    val width: Int get() = (right - left).coerceAtLeast(0)
    val height: Int get() = (bottom - top).coerceAtLeast(0)
    val centerX: Int get() = left + width / 2
    val centerY: Int get() = top + height / 2
    val isEmpty: Boolean get() = width == 0 || height == 0

    fun contains(x: Int, y: Int): Boolean = x in left until right && y in top until bottom

    companion object {
        val EMPTY = NodeBounds(0, 0, 0, 0)
    }
}

/** One node of the accessibility tree, flattened for the agent. */
data class UiNode(
    val id: String,
    val className: String,
    val text: String?,
    val contentDescription: String?,
    val clickable: Boolean,
    val scrollable: Boolean,
    val editable: Boolean,
    val enabled: Boolean,
    val focused: Boolean,
    val bounds: NodeBounds,
    val depth: Int,
    val children: List<UiNode> = emptyList(),
) {
    /** Best available human-readable label. */
    val label: String? get() = text?.takeIf { it.isNotBlank() }
        ?: contentDescription?.takeIf { it.isNotBlank() }

    /** True when the agent can act on this node. */
    val actionable: Boolean
        get() = enabled && (clickable || scrollable || editable)

    /** Flattens this subtree in depth-first order. */
    fun flatten(): List<UiNode> = buildList {
        add(this@UiNode)
        children.forEach { addAll(it.flatten()) }
    }
}

/**
 * Read-only view of an accessibility node.
 *
 * The parser works against this interface rather than
 * `android.accessibilityservice.AccessibilityNodeInfo` so tree walking,
 * actionability rules and search are pure logic that runs in JVM unit tests.
 * [AccessibilityNodeAdapter] adapts the real framework node.
 */
interface UiNodeSource {
    val className: String
    val text: String?
    val contentDescription: String?
    val clickable: Boolean
    val scrollable: Boolean
    val editable: Boolean
    val enabled: Boolean
    val focused: Boolean
    val bounds: NodeBounds
    val childCount: Int

    fun child(index: Int): UiNodeSource?

    /** Stable identity used to correlate a node across frames, if available. */
    val viewId: String?
        get() = null
}

/**
 * Converts an accessibility tree into the compact [UiNode] model the agent
 * reasons over.
 *
 * The walk is bounded on both depth and node count: a deep or pathological
 * tree must not stall the agent loop or blow up the prompt. Nodes that are
 * invisible (empty bounds) are skipped, and children of a skipped node are
 * still visited so a hidden container does not hide its visible children.
 */
class AccessibilityNodeParser(
    private val maxDepth: Int = DEFAULT_MAX_DEPTH,
    private val maxNodes: Int = DEFAULT_MAX_NODES,
) {

    private var visited = 0

    /** Parses [root], or returns null when the tree is empty or truncated. */
    fun parse(root: UiNodeSource): UiNode? {
        visited = 0
        return walk(root, depth = 0)
    }

    private fun walk(source: UiNodeSource, depth: Int): UiNode? {
        if (visited >= maxNodes) {
            return null
        }
        visited++
        val children = if (depth < maxDepth) {
            buildList {
                for (index in 0 until source.childCount) {
                    if (visited >= maxNodes) break
                    val child = source.child(index) ?: continue
                    walk(child, depth + 1)?.let(::add)
                }
            }
        } else {
            emptyList()
        }

        val bounds = source.bounds
        val node = UiNode(
            id = source.viewId ?: "node-$visited",
            className = source.className,
            text = source.text,
            contentDescription = source.contentDescription,
            clickable = source.clickable,
            scrollable = source.scrollable,
            editable = source.editable,
            enabled = source.enabled,
            focused = source.focused,
            bounds = bounds,
            depth = depth,
            children = children,
        )
        // Drop a leaf that carries nothing the agent can use.
        if (children.isEmpty() && bounds.isEmpty && node.label == null && !node.actionable) {
            return null
        }
        return node
    }

    companion object {
        const val DEFAULT_MAX_DEPTH = 40
        const val DEFAULT_MAX_NODES = 2000

        /** Depth-first search for the first node whose label contains [query]. */
        fun findByText(root: UiNode, query: String, ignoreCase: Boolean = true): UiNode? {
            val matches: (String?) -> Boolean = { candidate ->
                candidate != null && candidate.contains(query, ignoreCase = ignoreCase)
            }
            return root.flatten().firstOrNull { matches(it.text) || matches(it.contentDescription) }
        }

        /** All actionable nodes, in reading order (depth-first). */
        fun actionableNodes(root: UiNode): List<UiNode> = root.flatten().filter { it.actionable }
    }
}
