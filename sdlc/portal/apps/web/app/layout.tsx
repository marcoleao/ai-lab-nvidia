import type { Metadata } from 'next';
import './styles.css';
export const metadata: Metadata = { title: 'Portal SDLC', description: 'Planejamento e acompanhamento do ciclo de entrega' };
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="pt-BR"><body>{children}</body></html>; }
