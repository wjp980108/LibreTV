import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
  {
    rules: {
      // 播放器与 ArtPlayer/hls.js 交互处存在少量受控的 any（第三方类型未覆盖），
      // 保留告警即可，不阻塞构建
      '@typescript-eslint/no-explicit-any': 'warn',
      // Next 16 新增的 React Compiler 诊断先保留为告警；项目尚未启用
      // reactCompiler，现有播放器、ref 与外部状态同步模式另行改造。
      // rules-of-hooks / exhaustive-deps 继续使用 Next 的默认检查级别。
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
];

export default eslintConfig;
