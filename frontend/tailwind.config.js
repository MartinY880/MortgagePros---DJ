/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Legacy spotify-* tokens kept for any residual usage */
        spotify: {
          green: '#3165c3',
          hover: '#777b83',
          black: '#191414',
          dark: '#121212',
          gray: '#282828',
        },
        /* Semantic theme tokens driven by CSS variables */
        th: {
          page:        'var(--color-bg-page)',
          surface:     'var(--color-bg-surface)',
          elevated:    'var(--color-bg-elevated)',
          input:       'var(--color-bg-input)',
          hover:       'var(--color-bg-hover)',
          overlay:     'var(--color-bg-overlay)',
          brand:       'var(--color-brand)',
          'brand-hover': 'var(--color-brand-hover)',
          success:     'var(--color-success)',
          error:       'var(--color-error)',
          warning:     'var(--color-warning)',
          info:        'var(--color-info)',
          skeleton:    'var(--color-skeleton)',
          toggle:      'var(--color-toggle-track)',
          divider:     'var(--color-divider)',
          shadow:      'var(--color-shadow)',
        },
      },
      textColor: {
        primary:   'var(--color-text-primary)',
        secondary: 'var(--color-text-secondary)',
        muted:     'var(--color-text-muted)',
        faint:     'var(--color-text-faint)',
        disabled:  'var(--color-text-disabled)',
      },
      borderColor: {
        DEFAULT:  'var(--color-border)',
        subtle:   'var(--color-border-subtle)',
        muted:    'var(--color-border-muted)',
      },
      gradientColorStops: {
        'th-from': 'var(--color-gradient-from)',
        'th-to':   'var(--color-gradient-to)',
      },
      boxShadowColor: {
        'th-shadow': 'var(--color-shadow)',
      },
    },
  },
  plugins: [],
}
