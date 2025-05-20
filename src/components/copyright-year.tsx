
"use client";

import { useState, useEffect } from 'react';

const CopyrightYear = () => {
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  if (year === null) {
    // Return a placeholder or the current year as a static fallback during SSR / initial client render
    // For simplicity, returning the current year directly here, which might still cause a brief flicker
    // if server and client year differ during a new year transition.
    // A more robust solution might involve passing the server-rendered year as a prop
    // or using a more sophisticated state management for initial render.
    // However, for typical scenarios, this useEffect approach is standard.
    return <>{new Date().getFullYear()}</>; // Fallback for SSR or if JS is disabled, or return null
  }

  return <>{year}</>;
};

export default CopyrightYear;
