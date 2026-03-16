import "./globals.css";

export const metadata = {
  title: "U2SSO Sample Experiment",
  description: "Next.js signup/login sample backed by the shared U2SSO logic experiment"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
