import React, { useRef, useState, useEffect, useMemo } from 'react';

/**
 * Enhanced Scrolling Text component with infinite loop and constant speed.
 */
export const ScrollingText = ({ text, style = {} }) => {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [textWidth, setTextWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const check = () => {
    if (containerRef.current && textRef.current) {
      setContainerWidth(containerRef.current.offsetWidth);
      setTextWidth(textRef.current.offsetWidth);
    }
    setIsMobile(window.innerWidth <= 768);
  };

  useEffect(() => {
    check();
    const t1 = setTimeout(check, 100);
    const t2 = setTimeout(check, 1000);
    
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('resize', check);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [text]);

  const canScroll = textWidth > containerWidth;
  const gap = 60; // Space between loops
  const speed = 40; // Pixels per second
  const duration = useMemo(() => (textWidth + gap) / speed, [textWidth]);
  const animID = useMemo(() => `loop-${Math.random().toString(36).slice(2, 8)}`, [text, textWidth]);

  return (
    <div 
      ref={containerRef}
      onMouseEnter={check}
      style={{ 
        overflow: 'hidden', 
        whiteSpace: 'nowrap', 
        width: '100%',
        position: 'relative',
        ...style 
      }}
    >
      {canScroll && (
        <style>
          {`
            @keyframes ${animID} {
              from { transform: translateX(0); }
              to { transform: translateX(-${textWidth + gap}px); }
            }
            .mq-wrap-${animID} {
              display: inline-flex;
              align-items: center;
              width: max-content;
              animation: ${animID} ${duration}s linear infinite;
            }
          `}
        </style>
      )}
      <div className={`mq-wrap-${animID}`}>
        <span 
          ref={textRef} 
          style={{ display: 'inline-block', paddingRight: canScroll ? gap : 0 }}
        >
          {text}
        </span>
        {canScroll && (
          <span style={{ display: 'inline-block', paddingRight: gap }}>
            {text}
          </span>
        )}
      </div>
    </div>
  );
};
