export default [
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'alert', message: 'Proibido usar alert() nativo. Use Toast ou ConfirmDialog.' },
        { name: 'confirm', message: 'Proibido usar confirm() nativo. Use ConfirmDialog.' },
        { name: 'prompt', message: 'Proibido usar prompt() nativo. Use Dialog customizado.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name="select"]',
          message: 'Proibido usar <select> nativo. Use o componente Select customizado.',
        },
        {
          selector: 'JSXOpeningElement[name.name=/^[a-z]/] > JSXAttribute[name.name="title"]',
          message: 'Proibido usar atributo title nativo em elementos DOM. Use <Tooltip> ou aria-label.',
        },
      ],
    },
  },
];
