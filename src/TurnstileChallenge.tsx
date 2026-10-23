import React, { useEffect, useRef, useState } from "react";

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
let loading: Promise<Turnstile> | undefined;
function load(): Promise<Turnstile> {
  const api = () => (window as unknown as { turnstile?: Turnstile }).turnstile;
  if (api()) return Promise.resolve(api()!);
  if (!loading) loading = new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => api() ? resolve(api()!) : reject(new Error("Challenge unavailable"));
    script.onerror = () => reject(new Error("Challenge unavailable"));
    document.head.appendChild(script);
  }).catch(error => { loading = undefined; throw error; });
  return loading!;
}
export default function TurnstileChallenge({siteKey, onToken}: {siteKey: string; onToken: (token: string) => void}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken); callback.current = onToken;
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let widget: string | undefined;
    let api: Turnstile | undefined;
    load().then(instance => {
      if (!active || !container.current) return;
      api = instance;
      widget = api.render(container.current, {
        sitekey: siteKey, action: "rsvp",
        callback: (token: string) => { setError(false); callback.current(token); },
        "expired-callback": () => callback.current(""),
        "error-callback": () => { callback.current(""); setError(true); },
      });
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; if (api && widget !== undefined) api.remove(widget); };
  }, [siteKey]);
  return <div><div ref={container} aria-label="RSVP bot protection" />
    {error && <p role="alert" className="text-sm text-red-800">Verification could not load. Reopen this form to retry, or email the host.</p>}
  </div>;
}
