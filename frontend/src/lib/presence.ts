import type { RealtimeChannel, RealtimePresenceState } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type PresencePayload = {
  user_id: string;
  display_name: string;
  online_at: string;
};

export function subscribeToTeamPresence(
  currentUser: { id: string; displayName: string },
  onOnlineUserIdsChange: (onlineUserIds: Set<string>) => void
) {
  const channel = supabase.channel("teamchat-presence", {
    config: {
      presence: {
        key: currentUser.id,
      },
    },
  });

  const syncOnlineUsers = () => {
    const state = channel.presenceState<PresencePayload>() as RealtimePresenceState<PresencePayload>;
    const onlineUserIds = new Set<string>();
    for (const presences of Object.values(state)) {
      for (const meta of presences) {
        if (meta.user_id) {
          onlineUserIds.add(meta.user_id);
        }
      }
    }
    onOnlineUserIdsChange(onlineUserIds);
  };

  channel
    .on("presence", { event: "sync" }, syncOnlineUsers)
    .subscribe(async (status) => {
      if (status !== "SUBSCRIBED") {
        return;
      }
      await channel.track({
        user_id: currentUser.id,
        display_name: currentUser.displayName,
        online_at: new Date().toISOString(),
      });
    });

  return () => {
    void channel.untrack();
    void supabase.removeChannel(channel);
    onOnlineUserIdsChange(new Set());
  };
}

export function createTypingChannel(): RealtimeChannel {
  return supabase.channel("teamchat-typing");
}
