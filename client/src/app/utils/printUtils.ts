import toast from "react-hot-toast";

export function promptPrintOrientation(onSelect: (orientation: "portrait" | "landscape") => void) {
  // Create orientation selection modal overlay
  const modalContainer = document.createElement("div");
  modalContainer.id = "print-orientation-modal";
  modalContainer.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(8px);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  const modalBox = document.createElement("div");
  modalBox.style.cssText = `
    background-color: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.05);
    padding: 24px;
    width: 90%;
    max-width: 360px;
    text-align: center;
    color: #1e293b;
    animation: printModalOpen 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  // Add CSS keyframe for premium springy scale-in animation
  const styleTag = document.createElement("style");
  styleTag.textContent = `
    @keyframes printModalOpen {
      from { transform: scale(0.92); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
  `;
  document.head.appendChild(styleTag);

  modalBox.innerHTML = `
    <h3 style="margin: 0 0 6px 0; font-size: 16px; font-weight: 700; color: #0f172a; letter-spacing: -0.01em;">Print Layout Orientation</h3>
    <p style="margin: 0 0 20px 0; font-size: 13px; color: #64748b; line-height: 1.4;">Select the print/PDF page orientation:</p>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px;">
      <button id="btn-portrait" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 20px 12px; border: 2px solid #e2e8f0; border-radius: 12px; background: white; cursor: pointer; transition: all 0.2s ease; outline: none; box-sizing: border-box; width: 100%;">
        <span style="font-size: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.08));">📄</span>
        <div style="text-align: center;">
          <span style="font-size: 13px; font-weight: 600; color: #334155; display: block;">Portrait</span>
          <span style="font-size: 10px; font-weight: 500; color: #94a3b8; display: block; margin-top: 2px; text-transform: uppercase; tracking-wider: 0.05em;">Vertical</span>
        </div>
      </button>
      <button id="btn-landscape" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 20px 12px; border: 2px solid #e2e8f0; border-radius: 12px; background: white; cursor: pointer; transition: all 0.2s ease; outline: none; box-sizing: border-box; width: 100%;">
        <span style="font-size: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.08));">📇</span>
        <div style="text-align: center;">
          <span style="font-size: 13px; font-weight: 600; color: #334155; display: block;">Landscape</span>
          <span style="font-size: 10px; font-weight: 500; color: #94a3b8; display: block; margin-top: 2px; text-transform: uppercase; tracking-wider: 0.05em;">Horizontal</span>
        </div>
      </button>
    </div>
    <div style="display: flex; justify-content: flex-end; border-top: 1px solid #f1f5f9; pt-3; margin-top: 12px;">
      <button id="btn-cancel" style="padding: 7px 16px; border: 1px solid #cbd5e1; border-radius: 8px; background: white; font-size: 12px; font-weight: 500; color: #475569; cursor: pointer; transition: background 0.15s; outline: none; margin-top: 12px;">Cancel</button>
    </div>
  `;

  modalContainer.appendChild(modalBox);
  document.body.appendChild(modalContainer);

  const btnPortrait = modalBox.querySelector("#btn-portrait") as HTMLButtonElement;
  const btnLandscape = modalBox.querySelector("#btn-landscape") as HTMLButtonElement;
  const btnCancel = modalBox.querySelector("#btn-cancel") as HTMLButtonElement;

  const addHoverStyle = (btn: HTMLButtonElement) => {
    btn.onmouseenter = () => {
      btn.style.borderColor = "#6366f1";
      btn.style.background = "#f5f3ff";
      btn.style.transform = "translateY(-1px)";
    };
    btn.onmouseleave = () => {
      btn.style.borderColor = "#e2e8f0";
      btn.style.background = "white";
      btn.style.transform = "none";
    };
  };
  addHoverStyle(btnPortrait);
  addHoverStyle(btnLandscape);

  btnCancel.onmouseenter = () => { btnCancel.style.background = "#f8fafc"; };
  btnCancel.onmouseleave = () => { btnCancel.style.background = "white"; };

  const closeModal = () => {
    document.body.removeChild(modalContainer);
    document.head.removeChild(styleTag);
  };

  btnCancel.onclick = closeModal;

  btnPortrait.onclick = () => {
    closeModal();
    onSelect("portrait");
  };
  btnLandscape.onclick = () => {
    closeModal();
    onSelect("landscape");
  };
}

export function executePrint(
  element: HTMLElement | null,
  title: string,
  saveAsPDF = false,
  orientation: "portrait" | "landscape" = "landscape"
) {
  if (!element) return;

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    toast.error("Failed to open print window. Please allow popups.");
    return;
  }

  // Create document layout
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          /* Additional print override styles for cleaner margins */
          @page {
            size: A4 ${orientation};
            margin: 10mm;
          }
          body {
            background-color: white !important;
            color: black !important;
            padding: 15px !important;
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Hide interactive/unwanted elements during print */
          .no-print {
            display: none !important;
          }
          /* Prevent page breaks inside tables and charts */
          tr, table, div {
            page-break-inside: avoid;
          }
        </style>
      </head>
      <body>
        <div id="print-content">
          ${element.innerHTML}
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();

  // Copy all style tags & stylesheet links from parent window to print window
  const docStyles = Array.from(document.querySelectorAll("link[rel='stylesheet'], style"));
  docStyles.forEach((styleNode) => {
    printWindow.document.head.appendChild(styleNode.cloneNode(true));
  });

  if (saveAsPDF) {
    toast("In the print dialog, choose \"Save as PDF\" as the destination.", {
      icon: "📄",
      duration: 5000,
    });
  }

  // Focus and trigger print after styles load
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 350);
}

export function printElement(element: HTMLElement | null, title: string, saveAsPDF = false) {
  if (!element) {
    toast.error("Nothing to print!");
    return;
  }
  promptPrintOrientation((orientation) => {
    executePrint(element, title, saveAsPDF, orientation);
  });
}
