import {
  defineConfig,
  presetAttributify,
  presetUno,
  presetWind,
  transformerDirectives,
} from 'unocss';

export default defineConfig({
  presets: [presetUno(), presetAttributify(), presetWind()],
  transformers: [transformerDirectives()],
  shortcuts: [
    ['wh-full', 'w-full h-full'],
    ['flex-center', 'flex justify-center items-center'],
    ['flex-col', 'flex flex-col'],
    ['flex-col-center', 'flex flex-col justify-center items-center'],
    ['text-ellipsis', 'truncate'],
    ['text-standard', 'text-sm md:text-base'],
    ['text-standard-small', 'text-xs md:text-sm'],
    ['text-standard-big', 'text-base md:text-5'],
  ],
  rules: [],
  theme: {
    colors: {
      text: '#011d13',
      background: '#effef9',
      primary: '#0ef6a7',
      secondary: '#75ddfa',
      accent: '#3f9cf8',
    },
  },
});

