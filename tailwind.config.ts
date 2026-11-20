import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const cor = (v: string) => `hsl(var(${v}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: cor('--border'),
        input: cor('--input'),
        ring: cor('--ring'),
        background: cor('--background'),
        foreground: cor('--foreground'),
        primary: { DEFAULT: cor('--primary'), foreground: cor('--primary-foreground') },
        secondary: { DEFAULT: cor('--secondary'), foreground: cor('--secondary-foreground') },
        destructive: { DEFAULT: cor('--destructive'), foreground: cor('--destructive-foreground') },
        muted: { DEFAULT: cor('--muted'), foreground: cor('--muted-foreground') },
        accent: { DEFAULT: cor('--accent'), foreground: cor('--accent-foreground') },
        popover: { DEFAULT: cor('--popover'), foreground: cor('--popover-foreground') },
        card: { DEFAULT: cor('--card'), foreground: cor('--card-foreground') },
        success: cor('--success'),
        info: cor('--info'),
        gold: { DEFAULT: cor('--primary'), light: cor('--gold-light') },
        sidebar: { DEFAULT: cor('--sidebar'), 2: cor('--sidebar-2') },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
      },
    },
  },
  plugins: [animate],
} satisfies Config
