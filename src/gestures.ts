/** A pointer cannot become a click again after dragging, cancellation or multitouch. */
export class PointerGestures {
    private pointers = new Map<number, { x: number; y: number; click: boolean }>();
    down(id: number, x: number, y: number, button: number, primary: boolean): void {
        const multiple = this.pointers.size > 0;
        if (multiple) for (const p of this.pointers.values()) p.click = false;
        this.pointers.set(id, { x, y, click: button === 0 && primary && !multiple });
    }
    move(id: number, x: number, y: number): void {
        const p = this.pointers.get(id);
        if (p && Math.hypot(x - p.x, y - p.y) > 5) p.click = false;
    }
    up(id: number, x: number, y: number): boolean {
        this.move(id, x, y);
        const click = this.pointers.get(id)?.click ?? false;
        this.pointers.delete(id);
        return click;
    }
    cancel(id: number): void {
        this.pointers.delete(id);
        for (const p of this.pointers.values()) p.click = false;
    }
    clear(): void { this.pointers.clear(); }
    has(id: number): boolean { return this.pointers.has(id); }
    get active(): boolean { return this.pointers.size > 0; }
}
