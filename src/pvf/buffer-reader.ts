export class BufferReader {
	private buffer: Buffer;
	private offset = 0;

	constructor(buffer: Buffer) {
		this.buffer = buffer;
	}

	private checkBounds(need: number): void {
		if (this.offset + need > this.buffer.length) {
			throw new Error(
				`BufferReader: need ${need} bytes at offset ${this.offset}, but only ${this.buffer.length - this.offset} remaining`,
			);
		}
	}

	readUint8(): number {
		this.checkBounds(1);
		const val = this.buffer.readUInt8(this.offset);
		this.offset += 1;
		return val;
	}

	readInt8(): number {
		this.checkBounds(1);
		const val = this.buffer.readInt8(this.offset);
		this.offset += 1;
		return val;
	}

	readUint16(): number {
		this.checkBounds(2);
		const val = this.buffer.readUInt16LE(this.offset);
		this.offset += 2;
		return val;
	}

	readInt16(): number {
		this.checkBounds(2);
		const val = this.buffer.readInt16LE(this.offset);
		this.offset += 2;
		return val;
	}

	readInt32(): number {
		this.checkBounds(4);
		const val = this.buffer.readInt32LE(this.offset);
		this.offset += 4;
		return val;
	}

	readUint32(): number {
		this.checkBounds(4);
		const val = this.buffer.readUInt32LE(this.offset);
		this.offset += 4;
		return val;
	}

	readFloat(): number {
		this.checkBounds(4);
		const val = this.buffer.readFloatLE(this.offset);
		this.offset += 4;
		return val;
	}

	readAsciiString(len: number): string {
		this.checkBounds(len);
		const str = this.buffer.toString("ascii", this.offset, this.offset + len);
		this.offset += len;
		return str;
	}

	getOffset(): number {
		return this.offset;
	}

	setOffset(off: number): void {
		this.offset = off;
	}

	getRemaining(): number {
		return this.buffer.length - this.offset;
	}
}
