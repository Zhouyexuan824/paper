import { readFile, writeFile } from 'node:fs/promises';

const path = new URL(
  '../node_modules/three/examples/jsm/controls/OrbitControls.js',
  import.meta.url,
);
const forceGraphPath = new URL(
  '../node_modules/3d-force-graph/dist/3d-force-graph.mjs',
  import.meta.url,
);
const source = await readFile(path, 'utf8');
const originalHandler = `function onPointerUp( event ) {

	this._removePointer( event );`;
const guardedHandler = `function onPointerUp( event ) {

	// 3d-force-graph emits a synthetic pointerup without a pointerId after a click.
	// Reconnect cleanly instead of leaving OrbitControls with stale pointer state.
	if ( event.pointerId === undefined || event.pointerId === null ) {

		const element = this.domElement;
		this.disconnect();
		this.connect( element );
		return;

	}

	this._removePointer( event );`;
const originalPositionBlock = `			const position = this._pointerPositions[ pointerId ];

			// minimal placeholder event - allows state correction on pointer-up
			this._onTouchStart( { pointerId: pointerId, pageX: position.x, pageY: position.y } );`;
const guardedPositionBlock = `			const position = this._pointerPositions[ pointerId ];

			// A cancelled pointer can leave an ID in the active list without a position.
			// Reset the controls so this stale pointer cannot crash the next click.
			if ( position === undefined ) {

				const element = this.domElement;
				this.disconnect();
				this.connect( element );
				break;

			}

			// minimal placeholder event - allows state correction on pointer-up
			this._onTouchStart( { pointerId: pointerId, pageX: position.x, pageY: position.y } );`;

let patched = source;
if (patched.includes(originalHandler)) {
  patched = patched.replace(originalHandler, guardedHandler);
} else if (!patched.includes(guardedHandler)) {
  throw new Error(
    'OrbitControls pointer-up handler did not match the expected Three.js code.',
  );
}
if (patched.includes(originalPositionBlock)) {
  patched = patched.replace(originalPositionBlock, guardedPositionBlock);
} else if (!patched.includes(guardedPositionBlock)) {
  throw new Error(
    'OrbitControls touch recovery block did not match the expected Three.js code.',
  );
}
if (patched !== source) {
  await writeFile(path, patched, 'utf8');
} else {
  console.log('OrbitControls pointer recovery is already installed.');
}

const forceGraphSource = await readFile(forceGraphPath, 'utf8');
const syntheticPointerEvents = [
  {
    original: "new PointerEvent('pointerup')",
    patched: "new PointerEvent('pointerup', { pointerId: controls._pointers?.[0] ?? 0 })",
  },
  {
    original: `new PointerEvent('pointerup', {
              pointerType: 'touch'
            })`,
    patched: `new PointerEvent('pointerup', {
              pointerType: 'touch',
              pointerId: controls._pointers?.[0] ?? 0
            })`,
  },
];
let patchedForceGraph = forceGraphSource;
for (const event of syntheticPointerEvents) {
  if (patchedForceGraph.includes(event.original)) {
    patchedForceGraph = patchedForceGraph.replace(
      event.original,
      event.patched,
    );
  } else if (!patchedForceGraph.includes(event.patched)) {
    throw new Error(
      '3d-force-graph synthetic pointer event did not match the expected code.',
    );
  }
}
if (patchedForceGraph !== forceGraphSource) {
  await writeFile(forceGraphPath, patchedForceGraph, 'utf8');
  console.log('Installed 3d-force-graph pointer ID recovery.');
} else if (patched === source) {
  console.log('Pointer recovery patches are already installed.');
}
