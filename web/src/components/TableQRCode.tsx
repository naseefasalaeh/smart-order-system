"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type TableQRCodeProps = {
  tableId: string;
  tableNumber: string | number;
};

export default function TableQRCode({
  tableId,
  tableNumber,
}: TableQRCodeProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  useEffect(() => {
    const generateQRCode = async () => {
      try {
        const orderUrl = `${window.location.origin}/table/${tableId}`;

        const dataUrl = await QRCode.toDataURL(orderUrl, {
          width: 240,
          margin: 2,
          color: {
            dark: "#18181b",
            light: "#ffffff",
          },
        });

        setQrCodeUrl(dataUrl);
      } catch (error) {
        console.error("ไม่สามารถสร้าง QR Code ได้:", error);
      }
    };

    generateQRCode();
  }, [tableId]);

  const downloadQRCode = () => {
    if (!qrCodeUrl) return;

    const link = document.createElement("a");
    link.href = qrCodeUrl;
    link.download = `table-${tableNumber}-qr-code.png`;
    link.click();
  };

  return (
    <div className="flex flex-col items-center">
      {qrCodeUrl ? (
        <img
          src={qrCodeUrl}
          alt={`QR Code โต๊ะ ${tableNumber}`}
          className="h-48 w-48 rounded-lg border border-zinc-200 bg-white p-2"
        />
      ) : (
        <div className="flex h-48 w-48 items-center justify-center rounded-lg bg-zinc-100 text-sm text-zinc-500">
          กำลังสร้าง QR Code...
        </div>
      )}

      <button
        type="button"
        onClick={downloadQRCode}
        disabled={!qrCodeUrl}
        className="mt-3 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        ดาวน์โหลด QR Code
      </button>
    </div>
  );
}