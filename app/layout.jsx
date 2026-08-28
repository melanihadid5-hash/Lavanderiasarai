export const metadata = {
  title: "Lavandería Sarai — Consulta tu pedido",
  description: "Consulta el estado de tu ropa con tu número de ticket.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2F6FEB",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <style>{`
          * { box-sizing: border-box; }
          html, body {
            margin: 0; padding: 0;
            background: #F6F8FC;
            color: #14213D;
            font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            -webkit-font-smoothing: antialiased;
          }
          input, button { font-family: inherit; }
          input:focus { outline: none; box-shadow: 0 0 0 3px #EAF1FF; }
          button { cursor: pointer; }
          @keyframes spin { to { transform: rotate(360deg); } }
          .spin { animation: spin 1s linear infinite; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
