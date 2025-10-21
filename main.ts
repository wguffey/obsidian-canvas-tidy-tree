import { Notice, Plugin, TFile } from "obsidian";
// @ts-ignore - use UMD bundle inside Obsidian
import ELK from "elkjs/lib/elk.bundled";

type CanvasNode = {
    id: string;
    type?: string; // "text" | "file" | "link" | "group" | ...
    x: number;
    y: number;
    width: number;
    height: number;
    label?: string;
    color?: string;
    backgroundColor?: string;
};

type CanvasEdge = {
    id: string;
    fromNode: string;
    toNode: string;
    fromSide?: "left" | "right" | "top" | "bottom";
    toSide?: "left" | "right" | "top" | "bottom";
    label?: string;
};

type CanvasDoc = {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
};

type Dir = "RIGHT" | "DOWN" | "LEFT" | "UP";
type WritingMode = "LR" | "TB" | "RL" | "BT";

type GroupSnapshot = {
    childNodes: Map<string, string[]>; // groupId -> nodeIds
    childGroups: Map<string, string[]>; // groupId -> groupIds
    depth: Map<string, number>; // groupId -> nesting depth
};

type Rect = {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    comp: number;
};


function writingModeFor(direction: Dir): WritingMode {
    switch (direction) {
        case "RIGHT":
            return "LR";
        case "DOWN":
            return "TB";
        case "LEFT":
            return "RL";
        case "UP":
            return "BT";
    }
}

function edgeSidesFor(direction: Dir): {
    from: CanvasEdge["fromSide"];
    to: CanvasEdge["toSide"];
} {
    switch (direction) {
        case "RIGHT":
            return { from: "right", to: "left" };
        case "DOWN":
            return { from: "bottom", to: "top" };
        case "LEFT":
            return { from: "left", to: "right" };
        case "UP":
            return { from: "top", to: "bottom" };
    }
}

export default class CanvasElkLayout extends Plugin {
    async onload() {
        this.addCommand({
            id: "elk-tree-layout",
            name: "Canvas: ELK Tree Layout (Right)",
            callback: () => this.layoutActiveCanvas("RIGHT"),
        });
        this.addCommand({
            id: "elk-tree-layout-down",
            name: "Canvas: ELK Tree Layout (Down)",
            callback: () => this.layoutActiveCanvas("DOWN"),
        });
    }

    private getActiveCanvasFile(): TFile | null {
        const leaf: any = this.app.workspace.getLeaf(false);
        const view = leaf?.view;
        const file: TFile | undefined = (view?.file as TFile) ?? undefined;
        if (!file || !file.path.endsWith(".canvas")) return null;
        return file;
    }

    private async readCanvas(file: TFile): Promise<CanvasDoc> {
        const raw = await this.app.vault.read(file);
        return JSON.parse(raw) as CanvasDoc;
    }

    private async writeCanvas(file: TFile, data: CanvasDoc) {
        await this.app.vault.modify(file, JSON.stringify(data, null, 2));
    }

    private toElkGraphNodesOnly(doc: CanvasDoc, direction: Dir): any {
        const nodes = doc.nodes.filter((n) => n.type !== "group");
        const nodeIds = new Set(nodes.map((n) => n.id));

        const elkEdges = doc.edges
            .filter((e) => nodeIds.has(e.fromNode) && nodeIds.has(e.toNode))
            .map((e) => ({
                id: e.id,
                sources: [e.fromNode],
                targets: [e.toNode],
            }));

        const elkChildren = nodes.map((n) => ({
            id: n.id,
            width: Math.max(n.width, 10),
            height: Math.max(n.height, 10),
        }));

        if (elkEdges.length === 0 && elkChildren.length > 1) {
            for (let i = 0; i < elkChildren.length - 1; i++) {
                elkEdges.push({
                    id: `__v_${i}`,
                    sources: [elkChildren[i].id],
                    targets: [elkChildren[i + 1].id],
                });
            }
        }

        return {
			id: "root",
			layoutOptions: {
				"elk.algorithm": "layered",
				"elk.direction": direction,
				"elk.layered.writingMode": writingModeFor(direction),
				"elk.layered.edgeRouting": "ORTHOGONAL",
				// "elk.spacing.nodeNode": "60",
				"elk.spacing.nodeNode": "105",
				// "elk.layered.spacing.nodeNodeBetweenLayers": "80",
				"elk.layered.spacing.nodeNodeBetweenLayers": "140",
				// optional, can help with stability:
				// "elk.considerModelOrder": "NODES_AND_EDGES"
			},
			// layoutOptions: {
			//     "elk.algorithm": "layered",
			//     "elk.direction": direction,
			//     "elk.layered.writingMode": writingModeFor(direction),
			//     "elk.layered.edgeRouting": "ORTHOGONAL",
			//     "elk.layered.spacing.nodeNodeBetweenLayers": "140",
			//     "elk.spacing.nodeNode": "80",
			//     "elk.layered.cycleBreaking.strategy": "GREEDY",
			//     "elk.layered.nodePlacement.strategy": "LINEAR_SEGMENTS"
			// },
			children: elkChildren,
			edges: elkEdges,
		};
    }

    private setEdgeAnchors(doc: CanvasDoc, direction: Dir) {
        const sides = edgeSidesFor(direction);
        const node = new Map(doc.nodes.map((n) => [n.id, n]));
        for (const e of doc.edges) {
            if (!node.has(e.fromNode) || !node.has(e.toNode)) continue;
            e.fromSide = sides.from;
            e.toSide = sides.to;
        }
    }

    private snapshotGroups(doc: CanvasDoc): GroupSnapshot {
        const groups = doc.nodes.filter(n => n.type === "group");
        const nonGroups = doc.nodes.filter(n => n.type !== "group");

        const contains = (g: CanvasNode, r: CanvasNode) =>
            r.x >= g.x && r.y >= g.y &&
            r.x + r.width  <= g.x + g.width &&
            r.y + r.height <= g.y + g.height;

        const childNodes = new Map<string, string[]>();
        const childGroups = new Map<string, string[]>();
        for (const g of groups) { childNodes.set(g.id, []); childGroups.set(g.id, []); }

        // snapshot membership by geometry (original positions)
        for (const g of groups) {
            for (const n of nonGroups) if (contains(g, n)) childNodes.get(g.id)!.push(n.id);
            for (const h of groups) if (h.id !== g.id && contains(g, h)) childGroups.get(g.id)!.push(h.id);
        }

        // compute depths via DFS
        const parents = new Map<string, string|null>();
        for (const g of groups) parents.set(g.id, null);
        for (const g of groups) {
            for (const p of groups) {
            if (g.id !== p.id && contains(p, g)) {
                // pick the smallest-area parent that contains g
                const prev = parents.get(g.id);
                const pick = (x: CanvasNode|null, y: CanvasNode) =>
                !x ? y : (x.width*x.height <= y.width*y.height ? x : y);
                parents.set(g.id, pick(prev ? groups.find(z => z.id===prev)! : null, p)!.id);
            }
            }
        }
        const depth = new Map<string, number>();
        const depthOf = (gid: string): number => {
            if (depth.has(gid)) return depth.get(gid)!;
            const p = parents.get(gid);
            const d = p ? depthOf(p) + 1 : 0;
            depth.set(gid, d);
            return d;
        };
        for (const g of groups) depthOf(g.id);

        return { childNodes, childGroups, depth };
    }

    private resizeGroupsFromSnapshot(doc: CanvasDoc, snap: GroupSnapshot, pad = 200, minW = 120, minH = 60) {
        const nodeById = new Map(doc.nodes.map(n => [n.id, n]));
        // deepest first
        const groupIds = Array.from(snap.depth.entries()).sort((a,b) => b[1]-a[1]).map(([id]) => id);

        for (const gid of groupIds) {
            const g = nodeById.get(gid)!; // group node
            const membersNodeIds = snap.childNodes.get(gid) ?? [];
            const membersGroupIds = snap.childGroups.get(gid) ?? [];

            const rects: Array<{x:number;y:number;w:number;h:number}> = [];
            for (const nid of membersNodeIds) {
            const n = nodeById.get(nid); if (!n) continue;
            rects.push({ x:n.x, y:n.y, w:n.width, h:n.height });
            }
            for (const cid of membersGroupIds) {
            const c = nodeById.get(cid); if (!c) continue; // child groups were updated earlier due to depth order
            rects.push({ x:c.x, y:c.y, w:c.width, h:c.height });
            }
            if (rects.length === 0) continue;

            const minX = Math.min(...rects.map(r => r.x)) - pad;
            const minY = Math.min(...rects.map(r => r.y)) - pad;
            const maxX = Math.max(...rects.map(r => r.x + r.w)) + pad;
            const maxY = Math.max(...rects.map(r => r.y + r.h)) + pad;

            g.x = Math.round(minX);
            g.y = Math.round(minY);
            g.width  = Math.max(minW, Math.round(maxX - minX));
            g.height = Math.max(minH, Math.round(maxY - minY));
        }
    }


    private computeComponents(doc: CanvasDoc): Map<string, number> {
        // Union-Find over non-group nodes
        const nodes = doc.nodes.filter(n => n.type !== "group").map(n => n.id);
        const idx = new Map(nodes.map((id,i)=>[id,i]));
        const parent = nodes.map((_,i)=>i);
        const find = (i:number)=> parent[i]===i?i:(parent[i]=find(parent[i]));
        const uni = (i:number,j:number)=>{ i=find(i); j=find(j); if(i!==j) parent[j]=i; };

        for (const e of doc.edges) {
            const a = idx.get(e.fromNode), b = idx.get(e.toNode);
            if (a!=null && b!=null) uni(a,b);
        }
        const compByNode = new Map<string, number>();
        nodes.forEach((id,i)=> compByNode.set(id, find(i)));
        // normalize ids to 0..k-1
        const mapOldNew = new Map<number,number>(); let c=0;
        for (const r of new Set(Array.from(compByNode.values()))) mapOldNew.set(r, c++);
        for (const [id,r] of compByNode) compByNode.set(id, mapOldNew.get(r)!);

        // assign groups to component of their majority children; else new unique comp
        let next = c;
        for (const g of doc.nodes.filter(n=>n.type==="group")) {
            const inside = doc.nodes.filter(n=>n.type!=="group" &&
            n.x>=g.x && n.y>=g.y && n.x+n.width<=g.x+g.width && n.y+n.height<=g.y+g.height
            ).map(n=>compByNode.get(n.id)).filter(v=>v!=null) as number[];
            if (inside.length===0) { compByNode.set(g.id, next++); continue; }
            const counts = new Map<number,number>();
            for (const v of inside) counts.set(v, 1+(counts.get(v)||0));
            const top = Array.from(counts.entries()).sort((a,b)=>b[1]-a[1])[0][0];
            compByNode.set(g.id, top);
        }
        return compByNode;
    }

    private collectGroupRects(doc: CanvasDoc, comp: Map<string,number>): Rect[] {
        return doc.nodes
            .filter(n=>n.type==="group")
            .map(n=>({ id:n.id, x:n.x, y:n.y, w:n.width, h:n.height, comp: comp.get(n.id) ?? -1 }));
    }

    private rectsOverlap(a: Rect, b: Rect, gap=16): boolean {
        return !(a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x ||
                a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y);
    }

    private resolveGroupOverlaps(doc: CanvasDoc, direction: "RIGHT"|"DOWN", gap=24, iters=4) {
        const comp = this.computeComponents(doc);
        const rects = this.collectGroupRects(doc, comp);
        if (rects.length === 0) return;

        // Push apart within each component along the primary axis
        const byComp = new Map<number, Rect[]>();
        for (const r of rects) {
            const k = r.comp;
            if (!byComp.has(k)) byComp.set(k, []);
            byComp.get(k)!.push(r);
        }

        for (const group of byComp.values()) {
            // iterated sweep to resolve residual overlaps
            for (let t=0; t<iters; t++) {
            // sort by primary axis
            group.sort((a,b)=> direction==="RIGHT" ? (a.x - b.x) : (a.y - b.y));
            for (let i=1;i<group.length;i++) {
                const prev = group[i-1], cur = group[i];
                if (!this.rectsOverlap(prev, cur, gap)) continue;
                if (direction==="RIGHT") {
                const shift = (prev.x + prev.w + gap) - cur.x;
                cur.x += shift;
                } else {
                const shift = (prev.y + prev.h + gap) - cur.y;
                cur.y += shift;
                }
            }
            }
        }

        // Write back
        const byId = new Map(rects.map(r=>[r.id,r]));
        for (const g of doc.nodes.filter(n=>n.type==="group")) {
            const r = byId.get(g.id); if (!r) continue;
            g.x = Math.round(r.x); g.y = Math.round(r.y);
            g.width = Math.round(r.w); g.height = Math.round(r.h);
        }
    }

    private packComponents(doc: CanvasDoc, direction:"RIGHT"|"DOWN", gap=120) {
        // Pack different connected components so they don't overlap.
        const comp = this.computeComponents(doc);

        // component bboxes over nodes+groups
        const compRects = new Map<number, {minX:number; minY:number; maxX:number; maxY:number}>();
        const add = (k:number,x:number,y:number,w:number,h:number)=>{
            if (!compRects.has(k)) compRects.set(k, {minX:x, minY:y, maxX:x+w, maxY:y+h});
            const r = compRects.get(k)!;
            r.minX = Math.min(r.minX, x); r.minY = Math.min(r.minY, y);
            r.maxX = Math.max(r.maxX, x+w); r.maxY = Math.max(r.maxY, y+h);
        };

        for (const n of doc.nodes.filter(n=>n.type!=="group")) {
            const k = comp.get(n.id) ?? -1; add(k, n.x, n.y, n.width, n.height);
        }
        for (const g of doc.nodes.filter(n=>n.type==="group")) {
            const k = comp.get(g.id) ?? -1; add(k, g.x, g.y, g.width, g.height);
        }

        const comps = Array.from(compRects.entries()).map(([k,r])=>({
            id:k, x:r.minX, y:r.minY, w:r.maxX-r.minX, h:r.maxY-r.minY
        })).sort((a,b)=> direction==="RIGHT" ? (a.x - b.x) : (a.y - b.y));

        if (comps.length<=1) return;

        // Chain pack along the primary axis
        if (direction==="RIGHT") {
            let cursor = comps[0].x;
            for (let i=0;i<comps.length;i++) {
            const c = comps[i];
            const targetX = i===0 ? c.x : cursor + gap;
            const dx = targetX - c.x;
            // Shift all members of this component by dx
            for (const n of doc.nodes) {
                const k = n.type==="group" ? comp.get(n.id) : comp.get(n.id);
                if (k === c.id) n.x += dx;
            }
            cursor = targetX + c.w;
            }
        } else {
            let cursor = comps[0].y;
            for (let i=0;i<comps.length;i++) {
            const c = comps[i];
            const targetY = i===0 ? c.y : cursor + gap;
            const dy = targetY - c.y;
            for (const n of doc.nodes) {
                const k = n.type==="group" ? comp.get(n.id) : comp.get(n.id);
                if (k === c.id) n.y += dy;
            }
            cursor = targetY + c.h;
            }
        }
    }
    
    private async layoutActiveCanvas(direction: "RIGHT" | "DOWN") {
        const file = this.getActiveCanvasFile();
        if (!file) {
            new Notice("Open a .canvas file first.");
            return;
        }

        const doc = await this.readCanvas(file);
        if (!doc?.nodes?.length) {
            new Notice("Canvas is empty.");
            return;
        }

        // snapshot original group membership & hierarchy
        const snap = this.snapshotGroups(doc);

        const elk = new ELK();
        const elkGraph = this.toElkGraphNodesOnly(doc, direction);
        const laidOut = await elk.layout(elkGraph);

        // apply node positions (non-groups only) + rebase
        const pos = new Map<
            string,
            { x: number; y: number; width: number; height: number }
        >();
        for (const c of laidOut.children ?? [])
            if (typeof c.x === "number" && typeof c.y === "number")
                pos.set(c.id, {
                    x: c.x,
                    y: c.y,
                    width: c.width ?? 10,
                    height: c.height ?? 10,
                });

        const minX = Math.min(...Array.from(pos.values()).map((p) => p.x));
        const minY = Math.min(...Array.from(pos.values()).map((p) => p.y));
        const dx = 100 - minX,
            dy = 100 - minY;

        for (const n of doc.nodes) {
            if (n.type === "group") continue;
            const p = pos.get(n.id);
            if (!p) continue;
            n.x = Math.round(p.x + dx);
            n.y = Math.round(p.y + dy);
        }

        // resize groups using the snapshot (handles nested groups)
        this.resizeGroupsFromSnapshot(doc, snap);
        this.resolveGroupOverlaps(doc, direction, /*gap=*/ 24, /*iters=*/ 4);
        this.packComponents(doc, direction, /*gap=*/ 180);
        
        // set connector sides
        this.setEdgeAnchors(doc, direction);

        await this.writeCanvas(file, doc);
        new Notice("Canvas laid out with ELK.");
        const leaves = this.app.workspace.getLeavesOfType("canvas");
        for (const leaf of leaves) {
            const view: any = leaf.view;
            if (view?.file?.path === file.path) {
                if (typeof view.requestSave === "function") view.requestSave();
                if (typeof view.rerender === "function") view.rerender(true);
            }
        }
    }
}
