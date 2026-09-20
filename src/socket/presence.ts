/**
 * In-memory presence tracker for current Node process.
 * Tracks connected socket count per userId to handle multi-tab / multi-device sessions.
 * Online when count > 0, offline when count === 0.
 */
class PresenceManager {
  private userSockets: Map<string, number> = new Map();

  /**
   * Register a new socket connection for a user.
   * Returns true if user transitioned from offline to online.
   */
  public addConnection(userId: string): boolean {
    const current = this.userSockets.get(userId) || 0;
    this.userSockets.set(userId, current + 1);
    return current === 0;
  }

  /**
   * Remove a socket connection on disconnect.
   * Returns true if user transitioned from online to offline.
   */
  public removeConnection(userId: string): boolean {
    const current = this.userSockets.get(userId) || 0;
    if (current <= 1) {
      this.userSockets.delete(userId);
      return current === 1;
    }
    this.userSockets.set(userId, current - 1);
    return false;
  }

  /**
   * Check if a user is currently online
   */
  public isOnline(userId: string): boolean {
    return (this.userSockets.get(userId) || 0) > 0;
  }

  /**
   * Get all currently online userIds
   */
  public getOnlineUsers(): string[] {
    return Array.from(this.userSockets.keys());
  }
}

export const presenceManager = new PresenceManager();
