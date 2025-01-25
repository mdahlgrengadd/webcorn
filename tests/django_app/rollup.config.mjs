import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';

export default [
    {
        input: 'src/server.js',
        output: [
            {
                file: 'dist/project_django/server.mjs',
                format: 'es'
            },
        ],
        plugins: [
            resolve(),
            commonjs(),
        ]
    },
    {
        input: 'src/sw.js',
        output: {
            file: 'dist/sw.mjs',
            format: 'es'
        },
        plugins: [
            resolve(),
            commonjs(),
        ]
    }
];