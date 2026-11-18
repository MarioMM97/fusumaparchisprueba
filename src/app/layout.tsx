import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Parchís IA',
  description: 'Un Parchís en el que cuatro modelos de IA juegan, deciden sus movimientos en JSON y conversan.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
