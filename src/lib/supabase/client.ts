// Browser client. DEMO BUILD: the only browser-side use is the follow-up
// tray's realtime subscription, which the demo replaces with the tray's
// existing 60-second poll — so this is a no-op realtime stub rather than a
// connection to a database.

type Channel = {
  on: (...args: unknown[]) => Channel;
  subscribe: (...args: unknown[]) => Channel;
};

export function createClient() {
  const channel: Channel = {
    on: () => channel,
    subscribe: () => channel,
  };
  return {
    channel: (_name: string) => channel,
    removeChannel: (_channel: Channel) => Promise.resolve("ok" as const),
  };
}
