import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import copy from 'rollup-plugin-copy';

export default [
    {
        input: 'src/index.js',
        output: [
            {
                file: 'dist/index.mjs',
                format: 'es'
            },
        ],
        plugins: [
            resolve(),
            commonjs(),
            copy({
                targets: [
                    {src: 'public/*', dest: 'dist'},
                ]
            }),
        ]
    },
    {
        input: 'src/worker.js',
        output: {
            file: 'dist/worker.mjs',
            format: 'es'
        },
        plugins: [
            resolve(),
            commonjs(),
        ]
    }
];