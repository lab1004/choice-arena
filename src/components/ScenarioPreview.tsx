import { Compass, Footprints, Search, Tent, ArrowUpRight } from "lucide-react";
export function ScenarioPreview() {
  return (
    <section className="scenario-preview" aria-labelledby="scenario-title">
      <div className="preview-top">
        <span>
          <Compass size={15} /> 탐험 시나리오
        </span>
        <span className="preview-tag">미리보기</span>
      </div>
      <div className="landscape" aria-hidden="true">
        <svg viewBox="0 0 600 260" fill="none">
          <defs>
            <linearGradient id="sky" x2="0" y2="1">
              <stop stopColor="#272344" />
              <stop offset="1" stopColor="#4f4263" />
            </linearGradient>
            <linearGradient id="door" x2="0" y2="1">
              <stop stopColor="#d7ff97" />
              <stop offset="1" stopColor="#769959" />
            </linearGradient>
          </defs>
          <path fill="url(#sky)" d="M0 0h600v260H0z" />
          <circle cx="427" cy="58" r="30" fill="#d3c7e7" opacity=".8" />
          <path
            d="m0 170 104-94 130 141 142-122 150 108 74-70v127H0"
            fill="#383549"
          />
          <path
            d="m0 203 152-69 101 101 82-89 136 58 129-47v103H0"
            fill="#252a35"
          />
          <path d="m190 260 64-50h92l75 50" fill="#73766b" />
          <path
            d="M260 218V98a40 40 0 0 1 80 0v120"
            stroke="#171e25"
            strokeWidth="28"
          />
          <path d="M263 217V100a37 37 0 0 1 74 0v117" fill="url(#door)" />
          <path d="M286 218V113l22-17v122" fill="#e3ffb6" opacity=".5" />
          <path
            d="m0 245 90-30 70 45H0m600-18-80-30-65 63h145"
            fill="#171f29"
          />
          <path
            d="m54 227 16-47 16 47m401 6 19-57 19 57m17-11 15-45 15 45"
            fill="#182a28"
          />
          <g fill="#e9f8cf">
            <circle cx="185" cy="58" r="2" />
            <circle cx="362" cy="34" r="1.5" />
            <circle cx="121" cy="35" r="1" />
            <circle cx="497" cy="94" r="1.5" />
            <circle cx="233" cy="131" r="2" />
          </g>
          <path d="m304 237 3-16h7l3 16" fill="#171f29" />
          <circle cx="310" cy="217" r="4" fill="#171f29" />
        </svg>
        <span className="scene-number">SCENARIO / 001</span>
      </div>
      <div className="scenario-body">
        <p className="eyebrow">같은 순간, 세 가지 가능성</p>
        <h2 id="scenario-title">숲 끝에서 발견한 문</h2>
        <p>
          지도에는 없던 문이 희미하게 빛난다.
          <br />문 너머에서 들려오는 소리. 당신의 선택은?
        </p>
        <div className="choice-preview">
          <span>
            <Footprints size={17} /> 문 안으로 들어간다{" "}
            <ArrowUpRight size={16} />
          </span>
          <span>
            <Search size={17} /> 주변의 단서를 찾는다 <ArrowUpRight size={16} />
          </span>
          <span>
            <Tent size={17} /> 안전한 곳에서 기다린다 <ArrowUpRight size={16} />
          </span>
        </div>
        <p className="preview-note">
          화면 예시예요. 상황 선택과 경기 진행은 추후 제공됩니다.
        </p>
      </div>
    </section>
  );
}
