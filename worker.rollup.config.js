import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';

export default [
    {
        input: 'build/worker.js',
        output: [
            {
                file: 'build/worker.mjs',
                format: 'es'
            },
        ],
        plugins: [
            resolve(),
            commonjs(),
        ]
    },
];