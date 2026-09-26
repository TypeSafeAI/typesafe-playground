import type { Metadata } from "next";
import { Shell } from "../components/shell";
import "./globals.css";
import "./brand.css";
import "./dashboard.css";
import "./workspace.css";
import "./polish.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://jev.works"),
  title: "TypeSafe · Playground",
  description:
    "An unofficial community workspace for Jev classification, conversation routing, and grounded document extraction.",
  openGraph: {
    type: "website",
    siteName: "TypeSafe Playground",
    title: "TypeSafe Playground — small experiments, clear decisions",
    description: "Unofficial community Jev experiments: classification, routing, extraction, and inspectable decisions.",
    images: [{ url: "/og.png", alt: "TypeSafe AI community playground — small experiments, clear decisions" }],
  },
  twitter: {
    card: "summary_large_image",
    images: [{ url: "/og.png", alt: "TypeSafe AI community playground — small experiments, clear decisions" }],
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.theme=localStorage.getItem('typesafe-playground-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch{}`,
          }}
        />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
