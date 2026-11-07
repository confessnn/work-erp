"use client";

import { useEffect, useState, useTransition } from "react";
import { deletePushSubscription, getVapidPublicKey, savePushSubscription } from "../actions";

type State = "checking" | "unsupported" | "ios-install" | "denied" | "off" | "on";

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return { reg, sub: await reg.pushManager.getSubscription() };
}

/** '이 휴대폰에서 알림 받기' 켜고 끄기 */
export function PushSetup() {
  const [state, setState] = useState<State>("checking");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      try {
        const { sub } = await currentSubscription();
        setState(sub ? "on" : "off");
      } catch {
        setState("unsupported");
      }
    })();
  }, []);

  const turnOn = () =>
    start(async () => {
      setMsg(null);
      const key = await getVapidPublicKey();
      if (!key) {
        setMsg("알림 준비가 아직 안 됐어요. 5분 뒤에 다시 눌러 주세요.");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      try {
        const { reg } = await currentSubscription();
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
        const r = await savePushSubscription(sub.toJSON(), navigator.userAgent);
        if (r.error) setMsg(r.error);
        else setState("on");
      } catch {
        setMsg("알림을 켜지 못했어요. 잠시 뒤 다시 해 주세요.");
      }
    });

  const turnOff = () =>
    start(async () => {
      const { sub } = await currentSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    });

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">🔔 이 휴대폰 알림</span>
      {state === "checking" && <span className="text-muted">확인 중…</span>}
      {state === "on" && (
        <>
          <span className="badge badge-paid">켜짐</span>
          <button type="button" onClick={turnOff} disabled={pending} className="text-muted hover:underline">끄기</button>
        </>
      )}
      {state === "off" && (
        <button type="button" onClick={turnOn} disabled={pending} className="chip">
          {pending ? "켜는 중…" : "알림 켜기"}
        </button>
      )}
      {state === "ios-install" && (
        <span className="text-muted">아이폰은 Safari에서 <b>홈 화면에 추가</b>한 ERP 아이콘으로 열어야 알림을 켤 수 있어요.</span>
      )}
      {state === "denied" && <span className="text-muted">알림이 차단돼 있어요. 휴대폰 설정에서 이 앱의 알림을 허용해 주세요.</span>}
      {state === "unsupported" && <span className="text-muted">이 브라우저에서는 알림을 받을 수 없어요.</span>}
      {msg && <span className="w-full text-danger">{msg}</span>}
    </div>
  );
}
