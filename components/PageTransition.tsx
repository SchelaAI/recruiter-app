"use client";

import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [displayPath, setDisplayPath] = useState(pathname);
  const [displayChildren, setDisplayChildren] = useState(children);
  const [animClass, setAnimClass] = useState("screen-enter");

  useEffect(() => {
    if (pathname !== displayPath) {
      setAnimClass("screen-leave");
      const t1 = setTimeout(() => {
        setDisplayPath(pathname);
        setDisplayChildren(children);
        setAnimClass("screen-enter");
      }, 150);
      return () => clearTimeout(t1);
    } else {
      setDisplayChildren(children);
    }
  }, [pathname, children, displayPath]);

  useEffect(() => {
    if (animClass === "screen-enter") {
      const t2 = setTimeout(() => setAnimClass(""), 220);
      return () => clearTimeout(t2);
    }
  }, [animClass]);

  return <div className={animClass}>{displayChildren}</div>;
}
