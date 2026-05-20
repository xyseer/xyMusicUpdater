import { useState, useEffect } from 'react';

export function useSSE() {
  const [entries, setEntries] = useState([]);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource('/api/events/');

    eventSource.onopen = () => {
      setIsLive(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message) {
          setEntries(prev => [data, ...prev].slice(0, 100));
        }
      } catch (e) {
        // Keep-alive or non-json
      }
    };

    eventSource.addEventListener('ping', () => {
      setIsLive(true);
    });

    eventSource.onerror = () => {
      setIsLive(false);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return { entries, setEntries, isLive };
}
