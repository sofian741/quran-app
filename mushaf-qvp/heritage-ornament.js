// Exact ornament drawing from the retired Mushaf renderer.
// Only the frame artwork is reused. The surah name stays in QVP's own font paths.
// QVP's transparent canvas paints the original title glyphs above this artwork.
export function createHeritageHeading(){
    const heading={innerHTML:''};
        const leaf = (x, y, rotation, scale = 1) =>
            `<g transform="translate(${x} ${y}) rotate(${rotation}) scale(${scale})">` +
                '<path class="botanical-leaf" d="M0 0C-5-10-19-13-13-25C-9-33-4-33 0-42C3-31 15-31 14-21C14-11 3-9 0 0Z"/>' +
                '<path class="botanical-vein" d="M0-3Q-4-18 0-33"/>' +
            '</g>';
        const flower = (x, y, radius = 1) => {
            const petals = Array.from({ length: 8 }, (_, index) =>
                `<path class="botanical-petal" transform="rotate(${index * 45})" d="M0-4C-8-10-14-17-8-24Q-3-27 0-35Q3-27 8-24C14-17 8-10 0-4Z"/>`
            ).join('');
            return `<g transform="translate(${x} ${y}) scale(${radius})">${petals}` +
                '<path class="botanical-calyx" d="M0-17Q4-5 17 0Q4 5 0 17Q-4 5-17 0Q-4-5 0-17Z"/>' +
                '<path class="botanical-heart" d="M0-7 6 0 0 7-6 0Z"/>' +
            '</g>';
        };
        const stems = `M35 112C65 109 70 66 111 68C144 68 159 83 148 108
            M35 112C65 115 70 158 111 156C144 156 159 141 148 116
            M79 89C64 88 54 72 61 65C68 57 79 65 75 73
            M79 135C64 136 54 152 61 159C68 167 79 159 75 151
            M139 108C149 77 176 62 204 76C239 94 218 117 200 107C189 101 195 89 202 92
            M139 116C149 147 176 162 204 148C239 130 218 107 200 117C189 123 195 135 202 132
            M207 79C223 70 232 63 242 68C255 77 242 87 236 80
            M207 145C223 154 232 161 242 156C255 147 242 137 236 144
            M222 112C246 103 262 86 267 69 M222 112C246 121 262 138 267 155`;
        const foliage = [
            [83,83,-48,.62],[103,70,-12,.56],[119,74,38,.5],
            [83,141,-132,.62],[103,154,192,.56],[119,150,142,.5],
            [166,78,28,.68],[187,71,66,.55],[214,86,108,.55],
            [166,146,152,.68],[187,153,114,.55],[214,138,72,.55],
            [247,96,-36,.63],[247,128,-144,.63],
            [54,104,-64,.54],[54,120,-116,.54]
        ].map(args => leaf(...args)).join('');
        const side = `<g class="botanical-side">` +
            '<path class="botanical-shadow" d="M41 112Q67 55 122 64Q176 48 212 69Q251 58 271 75Q254 99 227 112Q254 125 271 149Q251 166 212 155Q176 176 122 160Q67 169 41 112Z"/>' +
            `<path class="botanical-stem-outline" d="${stems}"/>` +
            `<path class="botanical-stem" d="${stems}"/>${foliage}` +
            `${flower(139,112)}${flower(92,65,.32)}${flower(92,159,.32)}` +
            `${flower(181,95,.28)}${flower(181,129,.28)}${flower(240,66,.27)}${flower(240,158,.27)}` +
            '<path class="botanical-gold-line" d="M50 112Q80 95 106 112Q80 129 50 112ZM217 112l11-7 11 7-11 7Z"/>' +
        '</g>';
        const cartouche = 'M342 54H658Q683 54 693 75Q711 71 720 88Q731 102 753 112Q731 122 720 136Q711 153 693 149Q683 170 658 170H342Q317 170 307 149Q289 153 280 136Q269 122 247 112Q269 102 280 88Q289 71 307 75Q317 54 342 54Z';
        const finial = '<path class="botanical-petal" d="M0 29C-6 17-15 15-16 5C-30 10-34-8-21-11C-21-26-9-28-6-38L0-50 6-38C9-28 21-26 21-11C34-8 30 10 16 5C15 15 6 17 0 29Z"/>' +
            '<path class="botanical-calyx" d="M0 17C-4 4-13 2-12-9Q-3-7 0 3Q3-7 12-9C13 2 4 4 0 17ZM0-10Q-13-23 0-38Q13-23 0-10Z"/>' +
            '<path class="botanical-vein" d="M0-35V11"/>';
        heading.innerHTML = `<svg class="surah-ornament" viewBox="0 0 1000 224" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
            '<path class="ornament-frame-outer" d="M28 40H972V184H28Z"/>' +
            '<path class="ornament-frame-inner" d="M34 46H966V178H34Z"/>' +
            '<path class="ornament-field" d="M41 53H959V171H41Z"/>' +
            `${side}<g transform="translate(1000 0) scale(-1 1)">${side}</g>` +
            `<path class="ornament-cartouche-rim" d="${cartouche}"/>` +
            `<path class="ornament-cartouche" d="${cartouche}"/>` +
            `<g class="ornament-watermark" transform="translate(309 112) scale(.8)">${flower(0,0)}${leaf(22,-7,50,.65)}${leaf(22,7,130,.65)}</g>` +
            `<g class="ornament-watermark" transform="translate(691 112) scale(-.8 .8)">${flower(0,0)}${leaf(22,-7,50,.65)}${leaf(22,7,130,.65)}</g>` +
            `<g transform="translate(500 53) scale(.65)">${finial}</g>` +
            `<g transform="translate(500 171) scale(.65 -.65)">${finial}</g>` +
            `<g transform="translate(34 112) rotate(-90) scale(.5)">${finial}</g>` +
            `<g transform="translate(966 112) rotate(90) scale(.5)">${finial}</g>` +
        '</svg>';

    return heading.innerHTML;
}
