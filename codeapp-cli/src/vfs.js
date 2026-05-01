import fs from 'node:fs';
import path from 'node:path';

// Implements the VFS contract @microsoft/power-apps-actions expects (see CliFs in the
// official CLI). Backed by node:fs and rooted at the current working directory.
export class NodeVfs {
  cwd;

  constructor(cwd = process.cwd()) {
    this.cwd = path.resolve(cwd);
  }

  getCwd() {
    return this.cwd;
  }

  getAbsolutePath(p) {
    return path.isAbsolute(p) ? p : path.resolve(this.cwd, p);
  }

  _abs(p) {
    return this.getAbsolutePath(p);
  }

  async readFile(p, encoding = 'utf-8') {
    return fs.promises.readFile(this._abs(p), encoding);
  }

  async writeFile(p, content, options = {}) {
    const abs = this._abs(p);
    const { createDirectories = true, encoding = 'utf-8' } = options;
    if (createDirectories) {
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    }
    await fs.promises.writeFile(abs, content, { encoding });
  }

  async appendFile(p, content) {
    await fs.promises.appendFile(this._abs(p), content, 'utf-8');
  }

  async readdir(p) {
    return fs.promises.readdir(this._abs(p));
  }

  async mkdir(p, options = {}) {
    await fs.promises.mkdir(this._abs(p), options);
  }

  async exists(p) {
    try {
      await fs.promises.stat(this._abs(p));
      return true;
    } catch {
      return false;
    }
  }

  async stat(p) {
    const s = await fs.promises.stat(this._abs(p));
    return {
      isFile: () => s.isFile(),
      isDirectory: () => s.isDirectory(),
      size: s.size,
      mtime: s.mtime,
      ctime: s.ctime,
    };
  }

  async isFile(p) {
    return (await this.stat(p)).isFile();
  }

  async isDirectory(p) {
    return (await this.stat(p)).isDirectory();
  }

  async rmdir(p) {
    await fs.promises.rm(this._abs(p), { recursive: true });
  }

  async unlink(p) {
    await fs.promises.unlink(this._abs(p));
  }

  resolve(...parts) {
    return path.resolve(...parts);
  }
  join(...parts) {
    return path.join(...parts);
  }
  relative(from, to) {
    return path.relative(from, to);
  }
  basename(p) {
    return path.basename(p);
  }
  dirname(p) {
    return path.dirname(p);
  }
}
