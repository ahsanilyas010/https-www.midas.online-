"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

// Fades the new page in. There is deliberately no exit animation: waiting for
// the old page to leave first made every navigation feel a beat slower.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="flex-1 overflow-y-auto"
    >
      {children}
    </motion.div>
  );
}
