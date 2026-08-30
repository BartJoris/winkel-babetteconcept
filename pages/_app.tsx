import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import Navigation from "../components/Navigation";

const PAGES_WITHOUT_NAV = ['/foodtruck', '/foodtruck-omzet'];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const path = (router.pathname || '/').replace(/\/$/, '') || '/';
  const hideNav = PAGES_WITHOUT_NAV.includes(path);

  return (
    <>
      {!hideNav && <Navigation />}
      <Component {...pageProps} />
    </>
  );
}
