// Job templates: seed measurements (empty values) for common jobs.
const L = (label, extra = {}) => ({ label, ...extra });
export const TEMPLATES = [
  { id: 'room', name: 'Room dimensions', tags: ['interior'], items: [L('Length'), L('Width'), L('Ceiling height'), L('Diagonal A', { mode: 'pythagorean' }), L('Diagonal B'), L('Door width'), L('Window width')] },
  { id: 'exterior', name: 'Exterior wall', tags: ['exterior'], items: [L('Wall length'), L('Wall height'), L('Window 1 width'), L('Window 1 height'), L('Door width'), L('Door height')] },
  { id: 'deck', name: 'Deck / post spacing', tags: ['deck'], items: [L('Deck length'), L('Deck width'), L('Height above grade'), L('Diagonal A'), L('Diagonal B'), L('Post spacing')] },
  { id: 'clearance', name: 'Vehicle clearance', tags: ['garage'], items: [L('Bay width'), L('Bay depth'), L('Door opening height'), L('Ceiling height'), L('Lift arm clearance'), L('Vehicle length'), L('Vehicle height')] },
  { id: 'cabinet', name: 'Cabinet fit', tags: ['kitchen'], items: [L('Wall run'), L('Opening width'), L('Opening height'), L('Depth available'), L('Floor to counter')] },
  { id: 'plumbing', name: 'Plumbing runs', tags: ['plumbing'], items: [L('Supply run'), L('Drain run'), L('Rise'), L('Fall (slope)'), L('Fixture to stack')] },
  { id: 'fence', name: 'Fence line', tags: ['fence'], items: [L('Run 1'), L('Run 2'), L('Gate opening'), L('Post spacing')] },
  { id: 'flooring', name: 'Laminate flooring', tags: ['flooring'], items: [L('Room length'), L('Room width'), L('Closet length'), L('Closet width'), L('Transition width')] },
];
