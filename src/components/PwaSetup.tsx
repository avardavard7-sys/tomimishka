"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PwaSetup() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(true);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    setStandalone(isStandalone);
    setIos(/iphone|ipad|ipod/i.test(nav.userAgent));

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone) return null;
  if (!deferred && !ios) return null;

  const install = async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    } else if (ios) {
      setShowIosHint(true);
    }
  };

  return (
    <>
      <button onClick={install} className="btn-primary !px-3.5 !py-1.5 !text-xs">
        ⤓ Скачать приложение
      </button>

      {showIosHint && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
          onClick={() => setShowIosHint(false)}
        >
          <div className="card max-w-sm p-6 text-left text-sm" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-lg font-semibold">Установка на iPhone / iPad</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-graphite">
              <li>Открой сайт в Safari</li>
              <li>Нажми «Поделиться» (квадрат со стрелкой вверх)</li>
              <li>Выбери «На экран “Домой”»</li>
              <li>Готово — Томи Мишка станет приложением 🐻</li>
            </ol>
            <button className="btn-ghost mt-5 w-full" onClick={() => setShowIosHint(false)}>
              Понятно
            </button>
          </div>
        </div>
      )}
    </>
  );
}
