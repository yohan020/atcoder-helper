import * as path from 'path';
import * as cp from 'child_process';

// 프로세스 입출력 공통 처리
function handleProcess(
    proc: cp.ChildProcessWithoutNullStreams,
    input: string,
    resolve: (value: string) => void,
    reject: (reason?: any) => void,
    timeoutMs: number = 10000
) {
    let stdout = '', stderr = '';
    let killed = false;

    // 타임아웃 설정
    const timer = setTimeout(() => {
        killed = true;
        proc.kill();
        reject(new Error(`⏱️ Time Limit Exceeded (${timeoutMs / 1000}s)`));
    }, timeoutMs);
    try {
        proc.stdin.write(input);
        proc.stdin.end();
    } catch (e) {
        clearTimeout(timer);
        reject(e);
    }
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);

    proc.on('close', code => {
        if (killed) return;
        clearTimeout(timer);
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr));
    });
    proc.on('error', err => {
        clearTimeout(timer);
        reject(err)
    });
}

// Python 실행
export function runPython(scriptPath: string, input: string, timeoutMs: number = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
        const cmd = process.platform === 'win32' ? 'python' : 'python3';
        const proc = cp.spawn(cmd, [scriptPath]);
        handleProcess(proc, input, resolve, reject, timeoutMs);
    });
}

// C/C++ 컴파일
export function compileCode(sourcePath: string, ext: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(sourcePath);
        const fileName = path.basename(sourcePath, ext);
        const outName = process.platform === 'win32' ? `${fileName}.exe` : fileName;
        const outPath = path.join(dir, outName);

        let cmd = 'g++';
        let args: string[] = [];
        if (ext.toLowerCase() === '.c') {
            cmd = 'gcc';
            args = [sourcePath, '-o', outPath, '-O2', '-lm'];
        } else {
            cmd = 'g++';
            args = [sourcePath, '-o', outPath, '-std=c++17', '-O2'];
        }

        cp.execFile(cmd, args, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || stdout || error.message));
            } else {
                resolve(outPath);
            }
        });
    });
}

// 컴파일된 실행 파일 실행 (C/C++, Rust)
export function runExecutable(exePath: string, input: string, timeoutMs: number = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
        const proc = cp.spawn(exePath);
        handleProcess(proc, input, resolve, reject, timeoutMs);
    });
}

// Java 컴파일
export function compileJava(sourcePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const args = [sourcePath, '-encoding', 'UTF-8'];

        cp.execFile('javac', args, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || stdout || error.message));
            } else {
                resolve(sourcePath);
            }
        });
    });
}

// Java 실행
export function runJava(sourcePath: string, input: string, timeoutMs: number = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(sourcePath);
        const mainClass = path.basename(sourcePath, '.java');

        const proc = cp.spawn('java', ['-cp', dir, '-Dfile.encoding=UTF-8', mainClass]);
        handleProcess(proc, input, resolve, reject, timeoutMs);
    });
}

// JavaScript 실행
export function runJavaScript(sourcePath: string, input: string, timeoutMs: number = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
        const proc = cp.spawn('node', [sourcePath]);
        handleProcess(proc, input, resolve, reject, timeoutMs);
    });
}

// TypeScript 실행
export function runTypeScript(sourcePath: string, input: string, timeoutMs: number = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
        // Windows에서 .cmd 파일 실행 시 shell: true 필요
        const proc = cp.spawn('npx', ['ts-node', sourcePath], {
            shell: process.platform === 'win32'
        });
        handleProcess(proc, input, resolve, reject, timeoutMs);
    });
}

// Go 실행
export function runGo(sourcePath: string, input: string, timeoutMs: number = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
        const proc = cp.spawn('go', ['run', sourcePath]);
        handleProcess(proc, input, resolve, reject, timeoutMs);
    });
}

// Rust 컴파일
export function compileRust(sourcePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(sourcePath);
        const fileName = path.basename(sourcePath, '.rs');

        // 윈도우는 .exe, 맥/리눅스는 확장자 없음
        const outName = process.platform === 'win32' ? `${fileName}.exe` : fileName;
        const outPath = path.join(dir, outName);

        const args = [sourcePath, '-o', outPath];

        cp.execFile('rustc', args, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || stdout || error.message));
            } else {
                resolve(outPath);
            }
        });
    });
}