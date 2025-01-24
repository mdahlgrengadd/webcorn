const fs = require('fs');

// 要替换的字符串
const placeholder = '{WEBCORN.PY}';

function ensureDir(directory) {
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
        console.log(`Directory created: ${directory}`);
    } else {
        console.log(`Directory already exists: ${directory}`);
    }
}


// 读取要替换的内容的文件
fs.readFile('src/webcorn.py', 'utf8', (err, data) => {
    if (err) {
        console.error('读取源文件时出错:', err);
        return;
    }

    // 读取目标文件
    fs.readFile('src/worker.js', 'utf8', (err, targetData) => {
        if (err) {
            console.error('读取目标文件时出错:', err);
            return;
        }

        // 替换目标文件中的指定字符串
        const updatedData = targetData.replace(placeholder, data);

        ensureDir('build')

        // 将更新后的内容写回目标文件
        fs.writeFile('build/worker.js', updatedData, 'utf8', (err) => {
            if (err) {
                console.error('写入目标文件时出错:', err);
                return;
            }
            console.log('替换完成！');
        });
    });
});