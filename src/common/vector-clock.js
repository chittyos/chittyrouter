/**
 * Vector Clock Implementation for Distributed Sessions
 * Consolidated from enhanced-session-sync.js and distributed-session-sync.js
 * Provides distributed consistency for cross-service synchronization
 */

export class VectorClock {
  constructor(nodeId, clock = {}) {
    this.nodeId = nodeId;
    this.clock = { ...clock };

    // Ensure this node exists in the clock
    if (!(nodeId in this.clock)) {
      this.clock[nodeId] = 0;
    }
  }

  /**
   * Increment this node's clock
   */
  tick() {
    this.clock[this.nodeId]++;
    return this;
  }

  /**
   * Update clock with received message
   */
  update(otherClock) {
    // Increment own clock
    this.tick();

    // Update with maximum values from other clock
    for (const [nodeId, timestamp] of Object.entries(otherClock)) {
      if (nodeId !== this.nodeId) {
        this.clock[nodeId] = Math.max(this.clock[nodeId] || 0, timestamp);
      }
    }

    return this;
  }

  /**
   * Compare with another vector clock
   * Returns: 'before', 'after', 'concurrent', or 'equal'
   */
  compare(otherClock) {
    const thisNodes = new Set(Object.keys(this.clock));
    const otherNodes = new Set(Object.keys(otherClock));
    const allNodes = new Set([...thisNodes, ...otherNodes]);

    let thisGreater = false;
    let otherGreater = false;

    for (const nodeId of allNodes) {
      const thisValue = this.clock[nodeId] || 0;
      const otherValue = otherClock[nodeId] || 0;

      if (thisValue > otherValue) {
        thisGreater = true;
      } else if (otherValue > thisValue) {
        otherGreater = true;
      }
    }

    if (thisGreater && !otherGreater) return "after";
    if (otherGreater && !thisGreater) return "before";
    if (!thisGreater && !otherGreater) return "equal";
    return "concurrent";
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      nodeId: this.nodeId,
      clock: this.clock,
      timestamp: Date.now(),
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(data) {
    return new VectorClock(data.nodeId, data.clock);
  }

  /**
   * Get current clock state
   */
  getClock() {
    return { ...this.clock };
  }

  /**
   * Reset clock
   */
  reset() {
    this.clock = { [this.nodeId]: 0 };
    return this;
  }
}
