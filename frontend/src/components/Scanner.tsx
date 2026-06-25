import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

// カメラで QR/CODE128/EAN を読み取る（設計書 §8.1 @zxing/browser, FR-4.4）。
// 手入力フォールバックも提供（リスク表 §15: カメラ精度・端末差）。

interface Props {
  onScan: (text: string) => void;
  /** 連続スキャン（棚卸）。true なら読み取り後も停止しない。 */
  continuous?: boolean;
  /** 同一値の連続読み取りを無視するクールダウン(ms)。 */
  cooldownMs?: number;
}

export default function Scanner({ onScan, continuous = false, cooldownMs = 1500 }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    (async () => {
      try {
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
          if (!result) return;
          const text = result.getText();
          const now = Date.now();
          if (text === lastRef.current.text && now - lastRef.current.at < cooldownMs) return;
          lastRef.current = { text, at: now };
          onScan(text);
          if (!continuous) controls.stop();
        });
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      } catch (e) {
        setError(
          "カメラを起動できませんでした。権限を確認するか、下の手入力をご利用ください。"
        );
        console.error(e);
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const v = manual.trim();
    if (v) {
      onScan(v);
      setManual("");
    }
  }

  return (
    <div className="scanner">
      {!error && (
        <div className="scanner-frame">
          <video ref={videoRef} className="scanner-video" muted playsInline />
          <div className="scanner-guide" />
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <form className="manual" onSubmit={submitManual}>
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="管理番号を手入力 (例: KRD-000123)"
          aria-label="管理番号を手入力"
        />
        <button type="submit">検索</button>
      </form>
    </div>
  );
}
