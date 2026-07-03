import toast from "react-hot-toast";

export function printElement(element: HTMLElement | null, title: string, saveAsPDF = false) {
  if (!element) {
    toast.error("Nothing to print!");
    return;
  }

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
            size: A4 landscape;
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
