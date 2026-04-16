import { motion } from "motion/react";
import { ComponentProps, ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

export function MotionDiv(props: ComponentProps<typeof motion.div>) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <div key={props.key} className={props.className}>
        {props.children as ReactNode}
      </div>
    );
  }
  return <motion.div {...props} />;
}
