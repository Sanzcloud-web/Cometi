import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

export function SparklesIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3v2m0 14v2m9-9h-2M5 12H3m14.95-6.95-1.41 1.41M8.46 15.54 7.05 16.95m0-9.9 1.41 1.41m9.49 9.49-1.41-1.41M8 12a4 4 0 1 1 4 4" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 5v14m-7-7h14" />
    </svg>
  );
}

export function BookmarkIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7 5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16l-5-3-5 3V5z" />
    </svg>
  );
}

export function PaperAirplaneIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m3 3 18 9-18 9 5-9-5-9z" />
    </svg>
  );
}

export function MicrophoneIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
      <path d="M19 10a7 7 0 0 1-14 0" />
      <path d="M12 17v4" />
      <path d="M8 21h8" />
    </svg>
  );
}

export function SparkleGroupIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M10 2.5 11.4 6l3.6.4-2.7 2.5.8 3.6-3.1-1.8-3.1 1.8.8-3.6L5 6.4l3.6-.4L10 2.5z" opacity="0.7" />
      <path d="M3.5 10.5 4.2 12l1.5.2-1.1 1 0.3 1.5L4 13.7l-1.4 0.8 0.3-1.5-1.1-1L3.3 12l0.2-1.5z" opacity="0.4" />
    </svg>
  );
}

export function LoaderDots(props: IconProps) {
  return (
    <svg viewBox="0 0 120 30" {...props}>
      <circle cx="15" cy="15" r="5" fill="currentColor">
        <animate attributeName="opacity" values="0;1;0" dur="1.2s" repeatCount="indefinite" begin="0" />
      </circle>
      <circle cx="60" cy="15" r="5" fill="currentColor">
        <animate attributeName="opacity" values="0;1;0" dur="1.2s" repeatCount="indefinite" begin="0.2s" />
      </circle>
      <circle cx="105" cy="15" r="5" fill="currentColor">
        <animate attributeName="opacity" values="0;1;0" dur="1.2s" repeatCount="indefinite" begin="0.4s" />
      </circle>
    </svg>
  );
}
