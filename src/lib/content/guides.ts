/**
 * Knowledge centre content.
 *
 * Written from scratch. Nothing here is copied from the game's wiki or from another
 * tool: where the wiki is the better reference we link to it rather than reproducing
 * it. The audience is a player who has never seen a margin calculation, so finance
 * vocabulary is introduced rather than assumed.
 *
 * Content lives in TypeScript rather than MDX deliberately: it is fully typed, it
 * participates in search and internal linking without a build step, and there is no
 * markdown pipeline to keep secure against the content itself.
 */

export interface GuideSection {
  readonly heading: string;
  readonly body: readonly string[];
  /** Optional worked example — the thing that makes an abstract rule land. */
  readonly example?: { readonly title: string; readonly lines: readonly string[] };
  /** Optional callout, used sparingly for the one thing people get wrong. */
  readonly warning?: string;
}

export interface Guide {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  /** Search-engine description and card subtitle. */
  readonly description: string;
  readonly level: 'Start here' | 'Core concepts' | 'Going deeper';
  readonly minutes: number;
  readonly sections: readonly GuideSection[];
  readonly related: readonly string[];
  /** Tools that let the reader immediately apply what they just read. */
  readonly tools: readonly { readonly href: string; readonly label: string }[];
}

export const GUIDES: readonly Guide[] = [
  {
    slug: 'getting-started',
    title: 'How Sim Companies actually works',
    summary: 'The loop the whole game runs on, and where your money comes from.',
    description:
      'A plain-language explanation of the Sim Companies core loop: buildings produce goods, goods are sold, and the gap between what production costs and what goods fetch is your profit.',
    level: 'Start here',
    minutes: 5,
    sections: [
      {
        heading: 'The loop',
        body: [
          'Everything in Sim Companies comes down to one cycle. You own buildings. Buildings turn inputs into outputs over time, paying wages the whole while. You sell the outputs. What is left after inputs and wages is your profit.',
          'That is the whole game. Every decision you will make — what to build, what to produce, whether to buy a material or make it — is a question about which version of that cycle earns the most per hour.',
        ],
      },
      {
        heading: 'Why "per hour" is the number that matters',
        body: [
          'Beginners usually compare products by how much profit each unit makes. That is the wrong comparison, and it is expensive.',
          'A building is a machine that runs continuously. What you care about is how much money it makes while it runs, not how much it makes per item. A product that earns $2 a unit but produces 500 an hour beats a product that earns $40 a unit and produces 5.',
          'Whenever this site shows you a profit figure, the per-hour number is the headline for exactly this reason.',
        ],
        example: {
          title: 'Two products, same building',
          lines: [
            'Product A: $2.00 profit per unit, 500 units/hour  →  $1,000/hour',
            'Product B: $40.00 profit per unit, 5 units/hour   →  $200/hour',
            'Product A is five times better, despite looking twenty times worse per unit.',
          ],
        },
      },
      {
        heading: 'Where new players lose money',
        body: [
          'Almost always in the same place: they count the cost of materials and forget everything else. Wages run whether or not the building is producing something worth selling. Administration overhead multiplies those wages as your company grows. Selling on the Exchange costs a fee. Moving goods costs transport.',
          'A production line that looks profitable on materials alone is routinely loss-making once the rest is counted. Every calculator here counts all of it by default.',
        ],
      },
    ],
    related: ['profit', 'opportunity-cost'],
    tools: [
    ],
  },
  {
    slug: 'profit',
    title: 'What profit actually costs you',
    summary: 'Every component of a real profit figure, and why most estimates are too high.',
    description:
      'The full cost of production in Sim Companies: materials, wages, administration overhead, transport and the exchange fee — and how to calculate profit per unit, per hour and per day.',
    level: 'Core concepts',
    minutes: 7,
    sections: [
      {
        heading: 'The five costs',
        body: [
          'A unit of anything you produce carries five costs. Miss one and your profit estimate is wrong in the optimistic direction.',
          '**Materials.** What the inputs cost you, at the price you actually paid — not the price you wish you had paid.',
          '**Wages.** Your building pays a fixed amount per hour per level. Spread across the units it produced in that hour, this becomes a cost per unit. A building running at half capacity pays full wages.',
          '**Administration overhead.** A percentage that multiplies your wage bill. It rises as your company grows, which is why a production line that was profitable at ten buildings can stop being profitable at thirty.',
          '**Transport.** Goods need moving, and that costs money per unit shifted.',
          '**The exchange fee.** Selling on the Exchange takes a percentage of the sale. You never receive the sticker price.',
        ],
        warning:
          'Administration overhead is the one people forget. It is not charged per building — it scales with your whole company, so a new building quietly raises the cost of every existing one.',
      },
      {
        heading: 'Putting it together',
        body: [
          'Cost per unit is materials plus wages-per-unit plus transport. Revenue per unit is your sale price minus the exchange fee. Profit per unit is the difference. Multiply by units per hour and you have the number that matters.',
        ],
        example: {
          title: 'A worked example',
          lines: [
            'Building: produces 10 units/hour at level 1, wages $100/hour',
            'Wages per unit:      $100 / 10          = $10.00',
            'With 20% overhead:   $10.00 x 1.20      = $12.00',
            'Materials per unit:                       $6.00',
            'Total cost per unit:                      $18.00',
            'Sale price $30, less 3% fee:              $29.10',
            'Profit per unit:     $29.10 - $18.00    = $11.10',
            'Profit per hour:     $11.10 x 10        = $111.00',
          ],
        },
      },
      {
        heading: 'Break-even, and why you should know it',
        body: [
          'Your break-even price is the sale price at which profit is exactly zero. Below it, every unit you produce loses money.',
          'Knowing it turns a vague worry into a decision. When the market price of your output drops, you do not have to guess whether to keep producing — you compare it to a number you already have.',
        ],
      },
    ],
    related: ['getting-started', 'opportunity-cost', 'margins'],
    tools: [
      { href: '/calculators/break-even', label: 'Find your break-even price' },
    ],
  },
  {
    slug: 'opportunity-cost',
    title: 'Opportunity cost: the most expensive thing beginners ignore',
    summary: 'Why "cheaper to make it myself" is usually wrong.',
    description:
      'Opportunity cost in Sim Companies: why producing your own inputs is often more expensive than buying them, and how to compare buying against building correctly.',
    level: 'Core concepts',
    minutes: 6,
    sections: [
      {
        heading: 'The idea, in one sentence',
        body: [
          'The cost of doing something is not just what you spend — it is also whatever you gave up to do it.',
          'A building can only make one thing at a time. If it is producing materials for you, it is not producing the thing it is best at. The profit it is not making is a real cost, even though no money leaves your account.',
        ],
      },
      {
        heading: 'How it plays out',
        body: [
          'This is the trap in vertical integration. You need a material. You check: buying it costs $8 a unit, and making it costs you $5 in wages. Making it looks obviously better.',
          'But the building making it could have been producing something that earns $100 an hour. If it makes 10 units of your material an hour, you are giving up $10 per unit of profit to save $3. Buying was cheaper by $7 a unit, and the accounts will never show you why.',
        ],
        example: {
          title: 'The comparison done properly',
          lines: [
            'Buy on the Exchange:            $8.00/unit',
            'Make it yourself — cash cost:   $5.00/unit',
            'Profit that building gives up:  $100/hour ÷ 10 units = $10.00/unit',
            'True cost of making it:         $5.00 + $10.00 = $15.00/unit',
            'Buying is cheaper by $7.00 a unit.',
          ],
        },
        warning:
          'Opportunity cost only applies if the building had something better to do. If it would genuinely sit idle, its time really is free — and self-production really is cheaper.',
      },
      {
        heading: 'The same idea, everywhere else',
        body: [
          'Once you see it, it is in every decision. Cash sitting in your account earns nothing, so holding it has a cost. A building producing a low-margin product has a cost equal to the better product it is not making. Capital tied up in a slow-payback building is capital not funding a fast one.',
          'The buy-or-build calculator on this site shows both the naive answer and the honest one side by side, because the gap between them is the whole lesson.',
        ],
      },
    ],
    related: ['profit', 'mistakes'],
    tools: [
      { href: '/calculators/allocation', label: 'Compare where to put your money' },
    ],
  },
  {
    slug: 'margins',
    title: 'Margin, ROI and payback, in plain English',
    summary: 'Three financial terms this site uses constantly, explained without jargon.',
    description:
      'Plain-language definitions of margin, return on investment and payback period, and which one to use for which Sim Companies decision.',
    level: 'Core concepts',
    minutes: 5,
    sections: [
      {
        heading: 'Margin',
        body: [
          'Margin is profit as a share of the sale price. Sell something for $100 and keep $30, and your margin is 30%.',
          'It tells you how much cushion you have. A 40% margin can absorb a big rise in material prices before it becomes a loss; a 4% margin cannot. Use margin to judge how risky a production line is, not how good it is — a high margin on a product that barely sells is worth less than a thin margin on something that moves constantly.',
        ],
      },
      {
        heading: 'Return on investment (ROI)',
        body: [
          'ROI compares what you got back against what you put in. Spend $100,000 on a building that earns you $30,000 over a month, and the ROI for that month is 30%.',
          'It is the right tool for comparing things that cost different amounts. A building that earns $500 a day on $1,000,000 is worse than one earning $100 a day on $50,000, even though the first number is bigger.',
        ],
      },
      {
        heading: 'Payback period',
        body: [
          'Payback is simply how long until an investment has earned back what it cost. A $100,000 building earning $500 an hour pays back in 200 hours.',
          'This is usually the most useful of the three for building decisions, because it is intuitive and it captures risk: a building that pays back in three days is a small bet, and one that pays back in four months is a commitment to prices staying roughly where they are.',
        ],
        warning:
          'Payback ignores everything after the break-even point, so it can favour something fast and small over something slow and much larger. Use it alongside ROI, not instead of it.',
      },
      {
        heading: 'Which to use when',
        body: [
          '**Deciding what to produce?** Profit per hour, with margin as a risk check.',
          '**Deciding whether to build or upgrade?** Payback period first, ROI to compare against alternatives.',
          '**Deciding between two very different-sized investments?** ROI, or profit per hour per dollar of capital.',
        ],
      },
    ],
    related: ['profit', 'opportunity-cost'],
    tools: [
      { href: '/calculators/investment', label: 'Payback and ROI calculator' },
      { href: '/calculators/allocation', label: 'Compare competing investments' },
    ],
  },
  {
    slug: 'exchange',
    title: 'Reading the Exchange',
    summary: 'What the numbers on a market page mean, and which of them can mislead you.',
    description:
      'How to read Sim Companies market data: headline prices, measured order-book depth, liquidity, quality and volatility.',
    level: 'Core concepts',
    minutes: 6,
    sections: [
      {
        heading: 'The headline price is a market signal',
        body: [
          'Ledgerforge broad-market pages use the headline price reported by the Sim Companies market ticker. It is not an average, and the ticker does not identify the quality, quantity or seller behind that price.',
          'When Ledgerforge has measured a full order book for a product, it can separately show supply, listing count, liquidity and quality-specific prices. Those fields stay unavailable when they have not been measured.',
        ],
        warning:
          'Do not assume the headline ticker price represents enough quantity for a large purchase. Check measured order-book depth before using it for high-volume cost estimates.',
      },
      {
        heading: 'Quality',
        body: [
          'Goods are listed at a quality level. A buyer who needs at least quality 2 can be satisfied by anything of quality 2 or higher, so the effective price of "quality 2" is the cheapest offer at quality 2 or better — sometimes that is a quality 4 lot someone is clearing cheaply.',
          'That is how prices are calculated throughout this site, and it is why a higher quality occasionally shows a lower price than the one below it.',
        ],
      },
      {
        heading: 'Supply and liquidity',
        body: [
          'Supply is how many units are on offer in total. Liquidity, which we score from 0 to 100, combines that depth with how many separate sellers there are.',
          'They are not the same. Ten thousand units from one seller is fragile — that seller can withdraw and the market empties. The same volume across forty sellers is a market you can actually rely on.',
        ],
      },
      {
        heading: 'Volatility',
        body: [
          'Volatility measures how much a price bounces around, expressed as a percentage so that a $0.50 product and a $500 product can be compared directly.',
          'High volatility is not automatically bad — it is where the opportunities are — but it does mean that a profit calculation done now may not describe the situation in six hours.',
        ],
      },
    ],
    related: ['profit', 'mistakes'],
    tools: [
      { href: '/exchange', label: 'Browse the Exchange' },
      { href: '/market', label: 'See what is moving' },
    ],
  },
  {
    slug: 'mistakes',
    title: 'Common beginner mistakes',
    summary: 'The errors that cost the most, and how to avoid each one.',
    description:
      'The most expensive mistakes new Sim Companies players make — ignoring overhead, forgetting opportunity cost, overbuilding, and mispricing inputs — with the fix for each.',
    level: 'Start here',
    minutes: 6,
    sections: [
      {
        heading: 'Counting materials and forgetting everything else',
        body: [
          'The single most common error. Materials are the visible cost, so they get counted; wages, overhead, transport and the exchange fee do not.',
          '**The fix:** use a calculator that includes all of them, and be suspicious of any profit figure that seems too good.',
        ],
      },
      {
        heading: 'Assuming self-production is cheaper',
        body: [
          'It often is not, because the building doing the producing could have been earning more doing something else.',
          '**The fix:** always ask what that building would otherwise be making. If the answer is "something better", buying the input is probably right.',
        ],
      },
      {
        heading: 'Pricing inputs at the cheapest listing',
        body: [
          'The cheapest listing is frequently a small lot. Buying at scale means walking up the order book and paying more.',
          '**The fix:** check the depth. If you need 10,000 units and the cheapest offer covers 200, price your plan on what you would actually pay.',
        ],
      },
      {
        heading: 'Ignoring administration overhead as you grow',
        body: [
          'Overhead multiplies your wage bill and rises with your company. A production line that cleared 15% margin at ten buildings can be loss-making at forty, with nothing about that line having changed.',
          '**The fix:** re-check your best lines whenever you expand. The calculators here take your current overhead as an input for exactly this reason.',
        ],
      },
      {
        heading: 'Building before calculating',
        body: [
          'A building is a large, slow commitment. Constructing one to find out whether it pays is an expensive way to run the numbers.',
          '**The fix:** work out the payback period first. If it is longer than you are comfortable betting on prices staying stable, it is not the right build.',
        ],
      },
      {
        heading: 'Chasing whatever spiked today',
        body: [
          'The most profitable-looking product is very often the one whose price just jumped, and prices that jump tend to come back down.',
          '**The fix:** look at the price history and the volatility before committing. Our opportunity scanner flags recent spikes for this reason.',
        ],
      },
      {
        heading: 'Letting buildings sit idle',
        body: [
          'An idle building still pays wages. It is not neutral, it is a steady loss.',
          '**The fix:** if a line is not worth running, switch it to something that is, rather than leaving it stopped.',
        ],
      },
    ],
    related: ['opportunity-cost', 'profit', 'exchange'],
    tools: [
    ],
  },
  {
    slug: 'glossary',
    title: 'Glossary',
    summary: 'Every term this site uses, defined without assuming finance knowledge.',
    description:
      'Plain-language definitions of the financial and game terms used across Ledgerforge: margin, ROI, payback, opportunity cost, liquidity, volatility, overhead and more.',
    level: 'Start here',
    minutes: 4,
    sections: [
      {
        heading: 'Money and returns',
        body: [
          '**Profit per unit** — what you keep on one item after every cost.',
          '**Profit per hour** — what a building earns while it runs. The number that matters most.',
          '**Margin** — profit as a percentage of the sale price. A measure of cushion, not of quality.',
          '**Break-even price** — the sale price at which profit is exactly zero.',
          '**ROI** — return on investment: what you got back as a percentage of what you put in.',
          '**Payback period** — how long an investment takes to earn back its cost.',
          '**Opportunity cost** — the profit you gave up by choosing this over the best alternative.',
          '**Working capital** — money tied up in stock and running costs rather than available to spend.',
        ],
      },
      {
        heading: 'Production',
        body: [
          '**Input / material** — something consumed to make something else.',
          '**Output** — what a production line produces.',
          '**Recipe** — the set of inputs and quantities needed for one unit of output.',
          '**Throughput** — units produced or sold per hour.',
          '**Administration overhead** — a percentage that multiplies your wage bill, rising with company size.',
          '**Vertical integration** — producing your own inputs instead of buying them.',
          '**Bottleneck** — the step in a chain that limits everything downstream.',
        ],
      },
      {
        heading: 'Markets',
        body: [
          '**Order book** — all the open offers for a product.',
          '**Depth** — how many units are available near the current price.',
          '**Liquidity** — how easily you can buy or sell without moving the price. We score it 0–100 from depth and the number of sellers.',
          '**Volatility** — how much a price moves about, as a percentage, so different price levels compare directly.',
          '**Spread** — the gap between the cheapest and dearest current offers.',
          '**Quality** — a product’s grade. An offer satisfies any requirement at or below its quality.',
        ],
      },
    ],
    related: ['profit', 'margins', 'exchange'],
    tools: [{ href: '/methodology', label: 'How we calculate these figures' }],
  },
] as const;

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}

export const GUIDE_LEVELS = ['Start here', 'Core concepts', 'Going deeper'] as const;
