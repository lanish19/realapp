
import ValuGenForm from '@/components/valu-gen-form';
import CopyrightYear from '@/components/copyright-year';
import { Building } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center min-h-screen bg-background text-foreground p-4 sm:p-8 selection:bg-primary/20 selection:text-primary">
      <header className="w-full max-w-5xl mb-8 sm:mb-12">
        <div className="flex items-center justify-center sm:justify-start space-x-3">
          <Building className="h-10 w-10 sm:h-12 sm:w-12 text-primary" />
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-primary">ValuGen</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              AI-Powered Real Estate Appraisal Report Generation
            </p>
          </div>
        </div>
      </header>
      <main className="w-full max-w-5xl">
        <ValuGenForm />
      </main>
      <footer className="w-full max-w-5xl mt-12 py-6 text-center text-sm text-muted-foreground border-t">
        <p>&copy; <CopyrightYear /> ValuGen. All rights reserved.</p>
        <p className="mt-1">Powered by GenAI Kit & Next.js</p>
      </footer>
    </div>
  );
}
