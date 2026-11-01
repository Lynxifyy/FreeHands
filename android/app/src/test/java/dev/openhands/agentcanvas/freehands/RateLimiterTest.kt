package dev.openhands.agentcanvas.freehands

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RateLimiterTest {

    @Test
    fun `allows up to the limit within the window`() {
        val limiter = RateLimiter(maxActions = 3, windowMs = 1000) { 0L }

        assertTrue(limiter.tryAcquire())
        assertTrue(limiter.tryAcquire())
        assertTrue(limiter.tryAcquire())
        assertFalse(limiter.tryAcquire())
    }

    @Test
    fun `frees slots as the window slides`() {
        var now = 0L
        val limiter = RateLimiter(maxActions = 2, windowMs = 1000) { now }

        assertTrue(limiter.tryAcquire())
        assertTrue(limiter.tryAcquire())
        assertFalse(limiter.tryAcquire())

        now = 1001
        assertTrue(limiter.tryAcquire())
    }

    @Test
    fun `reports remaining slots`() {
        val limiter = RateLimiter(maxActions = 3, windowMs = 1000) { 0L }
        limiter.tryAcquire()

        assertEquals(2, limiter.remaining())
    }

    @Test
    fun `reports the wait until the next slot`() {
        var now = 500L
        val limiter = RateLimiter(maxActions = 1, windowMs = 1000) { now }
        limiter.tryAcquire()

        assertEquals(1000L, limiter.millisUntilAvailable())

        now = 1499
        assertTrue(limiter.millisUntilAvailable() > 0)

        now = 1500
        assertEquals(0L, limiter.millisUntilAvailable())
    }

    @Test
    fun `reset clears the window`() {
        val limiter = RateLimiter(maxActions = 1, windowMs = 1000) { 0L }
        limiter.tryAcquire()
        assertFalse(limiter.tryAcquire())

        limiter.reset()

        assertTrue(limiter.tryAcquire())
    }

    @Test(expected = IllegalArgumentException::class)
    fun `rejects a non positive limit`() {
        RateLimiter(maxActions = 0)
    }
}
