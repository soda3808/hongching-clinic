import { useState, useMemo } from 'react';
import escapeHtml from '../utils/escapeHtml';

const ACCENT = '#0e7490';
const FAV_KEY = 'hcmc_herb_favorites';

function loadFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } }
function saveFavs(arr) { localStorage.setItem(FAV_KEY, JSON.stringify(arr)); }

const CATEGORIES = ['全部','補氣','補血','清熱','解表','理氣','活血','安神','止咳','利水','消食','驅蟲','外用'];

const HERBS = [
  { id:1, zh:'黃芪', py:'huangqi', en:'Astragalus Root', cat:'補氣', prop:'性溫，味甘', mer:'歸脾、肺經', fx:'補氣升陽，固表止汗，利水消腫，生津養血，行滯通痹，托毒排膿，斂瘡生肌', zz:'氣虛乏力，食少便溏，中氣下陷，久瀉脫肛，便血崩漏，表虛自汗，氣虛水腫', dose:'9-30g，大劑量可用至60g', contra:'表實邪盛、氣滯濕阻、食積停滯、陰虛陽亢者慎用', combo:'配人參補氣；配當歸補血；配防風、白朮固表（玉屏風散）' },
  { id:2, zh:'人參', py:'renshen', en:'Ginseng Root', cat:'補氣', prop:'性微溫，味甘微苦', mer:'歸脾、肺、心、腎經', fx:'大補元氣，復脈固脫，補脾益肺，生津養血，安神益智', zz:'體虛欲脫，肢冷脈微，脾虛食少，肺虛喘咳，津傷口渴，氣短神疲', dose:'3-9g，獨煎或另燉；急救可用15-30g', contra:'實證、熱證忌服；不宜與藜蘆同用；反五靈脂', combo:'配附子回陽救逆（參附湯）；配白朮、茯苓益氣健脾（四君子湯）' },
  { id:3, zh:'白朮', py:'baizhu', en:'White Atractylodes', cat:'補氣', prop:'性溫，味苦甘', mer:'歸脾、胃經', fx:'健脾益氣，燥濕利水，止汗，安胎', zz:'脾虛食少，腹脹泄瀉，痰飲眩悸，水腫，自汗，胎動不安', dose:'6-12g', contra:'陰虛燥渴、氣滯脹悶者慎用', combo:'配人參、茯苓、甘草（四君子湯）；配黃芪、防風（玉屏風散）' },
  { id:4, zh:'甘草', py:'gancao', en:'Licorice Root', cat:'補氣', prop:'性平，味甘', mer:'歸心、肺、脾、胃經', fx:'補脾益氣，清熱解毒，祛痰止咳，緩急止痛，調和諸藥', zz:'脾胃虛弱，倦怠乏力，心悸氣短，咳嗽痰多，脘腹及四肢攣急疼痛', dose:'2-10g', contra:'不宜與海藻、大戟、甘遂、芫花同用；濕盛脹滿者慎用', combo:'配白芍緩急止痛（芍藥甘草湯）；配桔梗利咽（桔梗湯）' },
  { id:5, zh:'當歸', py:'danggui', en:'Angelica Root', cat:'補血', prop:'性溫，味甘辛', mer:'歸肝、心、脾經', fx:'補血活血，調經止痛，潤腸通便', zz:'血虛萎黃，眩暈心悸，月經不調，經閉痛經，虛寒腹痛，風濕痹痛，跌撲損傷，腸燥便秘', dose:'6-12g', contra:'濕盛中滿、大便溏泄者慎用', combo:'配黃芪補血（當歸補血湯）；配熟地、白芍、川芎（四物湯）' },
  { id:6, zh:'熟地黃', py:'shudihuang', en:'Prepared Rehmannia', cat:'補血', prop:'性微溫，味甘', mer:'歸肝、腎經', fx:'補血養陰，填精益髓', zz:'血虛萎黃，心悸怔忡，月經不調，崩漏下血，肝腎陰虛，腰膝酸軟，骨蒸潮熱，盜汗遺精，消渴', dose:'9-15g', contra:'脾虛痰多、氣滯中滿、食少便溏者慎用', combo:'配當歸、白芍、川芎（四物湯）；配山藥、山茱萸（六味地黃丸）' },
  { id:7, zh:'白芍', py:'baishao', en:'White Peony Root', cat:'補血', prop:'性微寒，味苦酸', mer:'歸肝、脾經', fx:'養血調經，斂陰止汗，柔肝止痛，平抑肝陽', zz:'血虛萎黃，月經不調，自汗盜汗，脅痛腹痛，四肢攣痛，頭痛眩暈', dose:'6-15g', contra:'虛寒之證不宜單用；反藜蘆', combo:'配甘草緩急止痛；配柴胡疏肝解鬱；配當歸養血調經' },
  { id:8, zh:'川芎', py:'chuanxiong', en:'Szechuan Lovage', cat:'活血', prop:'性溫，味辛', mer:'歸肝、膽、心包經', fx:'活血行氣，祛風止痛', zz:'胸痹心痛，胸脅刺痛，跌撲腫痛，月經不調，經閉痛經，產後瘀阻，頭痛，風濕痹痛', dose:'3-9g', contra:'陰虛火旺、多汗、熱盛及出血者慎用；孕婦慎用', combo:'配當歸活血調經；配天麻治頭痛（天麻鉤藤飲）；配赤芍、桃仁治血瘀' },
  { id:9, zh:'丹參', py:'danshen', en:'Red Sage Root', cat:'活血', prop:'性微寒，味苦', mer:'歸心、心包、肝經', fx:'活血祛瘀，通經止痛，清心除煩，涼血消癰', zz:'胸痹心痛，脘腹脅痛，癥瘕積聚，熱痹疼痛，心煩不眠，月經不調，痛經經閉', dose:'10-15g', contra:'無瘀血者慎用；反藜蘆；孕婦慎用', combo:'配三七活血止痛；配黃芪益氣活血；配檀香、砂仁理氣活血' },
  { id:10, zh:'金銀花', py:'jinyinhua', en:'Honeysuckle Flower', cat:'清熱', prop:'性寒，味甘', mer:'歸肺、心、胃經', fx:'清熱解毒，疏散風熱', zz:'癰腫疔瘡，喉痹丹毒，熱毒血痢，風熱感冒，溫病發熱', dose:'6-15g', contra:'脾胃虛寒及瘡瘍屬陰證者慎用', combo:'配連翹清熱解毒（銀翹散）；配蒲公英治癰腫；配黃芩清肺熱' },
  { id:11, zh:'黃連', py:'huanglian', en:'Coptis Rhizome', cat:'清熱', prop:'性寒，味苦', mer:'歸心、脾、胃、肝、膽、大腸經', fx:'清熱燥濕，瀉火解毒', zz:'濕熱痞滿，嘔吐吞酸，瀉痢腹痛，高熱神昏，心火亢盛，心煩不寐，血熱吐衄，目赤牙痛，癰腫疔瘡', dose:'2-5g', contra:'脾胃虛寒者忌用；苦寒傷胃不宜久服', combo:'配黃芩、黃柏（三黃瀉心湯）；配吳茱萸治吞酸（左金丸）；配半夏治嘔吐' },
  { id:12, zh:'黃芩', py:'huangqin', en:'Scutellaria Root', cat:'清熱', prop:'性寒，味苦', mer:'歸肺、膽、脾、大腸、小腸經', fx:'清熱燥濕，瀉火解毒，止血，安胎', zz:'濕溫暑濕，胸悶嘔惡，濕熱痞滿，瀉痢腹痛，黃疸尿赤，肺熱咳嗽，高熱煩渴，血熱吐衄，癰腫瘡毒，胎動不安', dose:'3-10g', contra:'脾肺虛寒者不宜', combo:'配黃連、黃柏清三焦熱；配柴胡和解少陽（小柴胡湯）；配白朮安胎' },
  { id:13, zh:'梔子', py:'zhizi', en:'Gardenia Fruit', cat:'清熱', prop:'性寒，味苦', mer:'歸心、肺、三焦經', fx:'瀉火除煩，清熱利濕，涼血解毒', zz:'熱病心煩，濕熱黃疸，淋證澀痛，血熱吐衄，目赤腫痛，火毒瘡瘍', dose:'6-10g', contra:'脾虛便溏者慎用', combo:'配淡豆豉除煩（梔子豉湯）；配黃柏治黃疸；配茵陳蒿清利濕熱' },
  { id:14, zh:'麻黃', py:'mahuang', en:'Ephedra', cat:'解表', prop:'性溫，味辛微苦', mer:'歸肺、膀胱經', fx:'發汗散寒，宣肺平喘，利水消腫', zz:'風寒感冒，胸悶喘咳，風水浮腫', dose:'2-9g', contra:'體虛自汗、陰虛盜汗及肺腎虛喘者禁用', combo:'配桂枝發汗解表（麻黃湯）；配杏仁宣肺平喘；配石膏清宣肺熱（麻杏石甘湯）' },
  { id:15, zh:'桂枝', py:'guizhi', en:'Cinnamon Twig', cat:'解表', prop:'性溫，味辛甘', mer:'歸心、肺、膀胱經', fx:'發汗解肌，溫通經脈，助陽化氣，平沖降逆', zz:'風寒感冒，脘腹冷痛，血寒經閉，關節痹痛，痰飲蓄水，心悸', dose:'3-9g', contra:'溫熱病及陰虛火旺、血熱妄行者忌用；孕婦慎用', combo:'配白芍調和營衛（桂枝湯）；配茯苓化氣利水（五苓散）；配附子溫陽' },
  { id:16, zh:'荊芥', py:'jingjie', en:'Schizonepeta', cat:'解表', prop:'性微溫，味辛', mer:'歸肺、肝經', fx:'祛風解表，透疹消瘡，止血', zz:'感冒頭痛，麻疹不透，瘡瘍初起，便血崩漏', dose:'5-10g', contra:'表虛自汗、陰虛頭痛者忌用', combo:'配防風祛風解表；配薄荷、牛蒡子疏風清熱；配白芷治頭痛' },
  { id:17, zh:'防風', py:'fangfeng', en:'Saposhnikovia Root', cat:'解表', prop:'性微溫，味辛甘', mer:'歸膀胱、肝、脾經', fx:'祛風解表，勝濕止痛，止痙', zz:'感冒頭痛，風濕痹痛，風疹瘙癢，破傷風', dose:'5-10g', contra:'陰血虧虛、熱病動風者不宜', combo:'配黃芪、白朮固表（玉屏風散）；配荊芥祛風止癢；配羌活勝濕止痛' },
  { id:18, zh:'陳皮', py:'chenpi', en:'Dried Tangerine Peel', cat:'理氣', prop:'性溫，味辛苦', mer:'歸脾、肺經', fx:'理氣健脾，燥濕化痰', zz:'脘腹脹滿，食少吐瀉，咳嗽痰多', dose:'3-10g', contra:'氣虛證、陰虛燥咳、吐血證慎用', combo:'配半夏燥濕化痰（二陳湯）；配蒼朮化濕運脾；配竹茹降逆止嘔' },
  { id:19, zh:'香附', py:'xiangfu', en:'Cyperus Rhizome', cat:'理氣', prop:'性平，味辛微苦微甘', mer:'歸肝、脾、三焦經', fx:'疏肝解鬱，理氣寬中，調經止痛', zz:'肝鬱氣滯，胸脅脹痛，疝氣疼痛，乳房脹痛，脾胃氣滯，脘腹痞悶，月經不調，經閉痛經', dose:'6-9g', contra:'氣虛無滯、陰虛血熱者慎用', combo:'配柴胡疏肝解鬱；配高良薑溫中止痛；配當歸調經止痛' },
  { id:20, zh:'枳殼', py:'zhike', en:'Bitter Orange', cat:'理氣', prop:'性微寒，味苦辛酸', mer:'歸脾、胃經', fx:'理氣寬中，行滯消脹', zz:'胸脅氣滯，脹滿疼痛，食積不化，痰飲內停', dose:'3-9g', contra:'脾胃虛弱及孕婦慎用', combo:'配白朮健脾消脹（枳朮丸）；配桔梗升降氣機；配厚朴行氣除脹' },
  { id:21, zh:'酸棗仁', py:'suanzaoren', en:'Sour Jujube Seed', cat:'安神', prop:'性平，味甘酸', mer:'歸肝、膽、心經', fx:'養心補肝，寧心安神，斂汗生津', zz:'虛煩不眠，驚悸多夢，體虛多汗，津傷口渴', dose:'9-15g', contra:'實邪鬱火者慎用', combo:'配知母養陰安神（酸棗仁湯）；配柏子仁養心安神；配五味子斂汗' },
  { id:22, zh:'遠志', py:'yuanzhi', en:'Polygala Root', cat:'安神', prop:'性微溫，味苦辛', mer:'歸心、腎、肺經', fx:'安神益智，交通心腎，祛痰消腫', zz:'心腎不交之失眠多夢，健忘驚悸，神志恍惚，咳痰不爽，瘡瘍腫毒', dose:'3-9g', contra:'胃炎及胃潰瘍者慎用；有潰瘍病史者不宜', combo:'配酸棗仁安神；配石菖蒲開竅寧神；配茯神養心安神' },
  { id:23, zh:'杏仁', py:'xingren', en:'Apricot Seed', cat:'止咳', prop:'性微溫，味苦', mer:'歸肺、大腸經', fx:'降氣止咳平喘，潤腸通便', zz:'咳嗽氣喘，胸滿痰多，腸燥便秘', dose:'5-10g', contra:'陰虛咳嗽及大便溏泄者慎用', combo:'配麻黃止咳平喘（三拗湯）；配貝母潤肺止咳；配蘇子降氣化痰' },
  { id:24, zh:'川貝母', py:'chuanbeimu', en:'Fritillaria Bulb', cat:'止咳', prop:'性微寒，味苦甘', mer:'歸肺、心經', fx:'清熱潤肺，化痰止咳，散結消癰', zz:'肺熱燥咳，乾咳少痰，陰虛勞嗽，痰中帶血，瘰癧瘡瘍，乳癰肺癰', dose:'3-9g，研粉沖服每次1-2g', contra:'不宜與烏頭類藥同用；脾胃虛寒及濕痰者不宜', combo:'配知母潤肺止咳（二母散）；配枇杷葉清肺化痰；配沙參養陰潤肺' },
  { id:25, zh:'茯苓', py:'fuling', en:'Poria', cat:'利水', prop:'性平，味甘淡', mer:'歸心、肺、脾、腎經', fx:'利水滲濕，健脾，寧心', zz:'水腫尿少，痰飲眩悸，脾虛食少，便溏泄瀉，心神不安，驚悸失眠', dose:'9-15g', contra:'虛寒精滑或氣虛下陷者慎用', combo:'配桂枝溫陽利水（五苓散）；配白朮健脾利濕；配酸棗仁寧心安神' },
  { id:26, zh:'澤瀉', py:'zexie', en:'Alisma Rhizome', cat:'利水', prop:'性寒，味甘淡', mer:'歸腎、膀胱經', fx:'利水滲濕，泄熱，化濁降脂', zz:'小便不利，水腫脹滿，泄瀉尿少，痰飲眩暈，熱淋澀痛，高脂血症', dose:'6-10g', contra:'腎虛精滑無濕熱者慎用', combo:'配白朮健脾利水；配茯苓利水滲濕；配熟地黃瀉腎中之濁（六味地黃丸）' },
  { id:27, zh:'山楂', py:'shanzha', en:'Hawthorn Fruit', cat:'消食', prop:'性微溫，味酸甘', mer:'歸脾、胃、肝經', fx:'消食健胃，行氣散瘀，化濁降脂', zz:'肉食積滯，胃脘脹滿，瀉痢腹痛，瘀血經閉，產後瘀阻，心腹刺痛，高脂血症', dose:'9-12g', contra:'脾胃虛弱而無積滯者慎用；孕婦慎用', combo:'配麥芽消食化積（保和丸）；配當歸、川芎活血化瘀；配決明子降脂' },
  { id:28, zh:'神麯', py:'shenqu', en:'Medicated Leaven', cat:'消食', prop:'性溫，味甘辛', mer:'歸脾、胃經', fx:'消食和胃', zz:'飲食停滯，消化不良，脘腹脹滿，食慾不振', dose:'6-15g', contra:'胃火盛者不宜', combo:'配山楂、麥芽消食導滯（保和丸）；配白朮健脾消食' },
  { id:29, zh:'使君子', py:'shijunzi', en:'Quisqualis Fruit', cat:'驅蟲', prop:'性溫，味甘', mer:'歸脾、胃經', fx:'殺蟲消積', zz:'蛔蟲腹痛，小兒疳積', dose:'9-12g，小兒每歲1-1.5粒，總量不超過20粒', contra:'大量服用可引起呃逆、眩暈、嘔吐；忌與茶同服', combo:'配苦楝皮驅蛔蟲；配檳榔驅殺多種腸道寄生蟲' },
  { id:30, zh:'檳榔', py:'binglang', en:'Areca Seed', cat:'驅蟲', prop:'性溫，味苦辛', mer:'歸胃、大腸經', fx:'殺蟲消積，行氣利水，截瘧', zz:'絛蟲、蛔蟲、薑片蟲病，蟲積腹痛，積滯瀉痢，裡急後重，水腫腳氣，瘧疾', dose:'3-10g；驅殺絛蟲60-120g', contra:'脾虛便溏、氣虛下陷者慎用', combo:'配南瓜子驅絛蟲；配大黃瀉下排蟲；配木香行氣導滯' },
  { id:31, zh:'硫黃', py:'liuhuang', en:'Sulfur', cat:'外用', prop:'性溫，味酸', mer:'歸腎、大腸經', fx:'外用解毒殺蟲療瘡，內服補火助陽通便', zz:'外治疥瘡，濕疹，陰疽；內治虛寒便秘，命門火衰', dose:'外用適量，研末油調塗敷；內服1-3g，炮製後入丸散', contra:'陰虛火旺及孕婦忌服', combo:'配半夏治虛冷便秘（半硫丸）；配枯礬研末外敷治疥瘡' },
  { id:32, zh:'冰片', py:'bingpian', en:'Borneol', cat:'外用', prop:'性微寒，味辛苦', mer:'歸心、脾、肺經', fx:'開竅醒神，清熱止痛', zz:'熱病神昏，驚厥，中風痰厥，目赤腫痛，口瘡咽腫', dose:'0.15-0.3g，入丸散用；外用適量，研粉點敷', contra:'孕婦慎用；氣血虛者忌服', combo:'配牛黃清熱開竅（安宮牛黃丸）；配硼砂、玄明粉治口瘡（冰硼散）' },
  { id:33, zh:'薄荷', py:'bohe', en:'Mint', cat:'解表', prop:'性涼，味辛', mer:'歸肺、肝經', fx:'疏散風熱，清利頭目，利咽透疹，疏肝行氣', zz:'風熱感冒，風溫初起，頭痛目赤，喉痹口瘡，風疹麻疹，胸脅脹悶', dose:'3-6g，宜後下', contra:'體虛多汗者不宜', combo:'配牛蒡子疏風利咽；配柴胡疏肝解鬱；配連翹清熱解表（銀翹散）' },
  { id:34, zh:'柴胡', py:'chaihu', en:'Bupleurum Root', cat:'解表', prop:'性微寒，味辛苦', mer:'歸肝、膽、肺經', fx:'和解表裡，疏肝升陽', zz:'感冒發熱，寒熱往來，胸脅脹痛，月經不調，子宮脫垂，脫肛', dose:'3-9g', contra:'陰虛陽亢、肝風內動者忌用；真陰虧損者禁用', combo:'配黃芩和解少陽（小柴胡湯）；配白芍疏肝柔肝；配升麻升舉陽氣' },
  { id:35, zh:'桃仁', py:'taoren', en:'Peach Kernel', cat:'活血', prop:'性平，味苦甘', mer:'歸心、肝、大腸經', fx:'活血祛瘀，潤腸通便，止咳平喘', zz:'經閉痛經，癥瘕痞塊，肺癰腸癰，跌撲損傷，腸燥便秘，咳嗽氣喘', dose:'5-10g', contra:'孕婦忌用；便溏者慎用', combo:'配紅花活血祛瘀；配大黃逐瘀瀉下（桃核承氣湯）；配杏仁止咳潤腸' },
  { id:36, zh:'紅花', py:'honghua', en:'Safflower', cat:'活血', prop:'性溫，味辛', mer:'歸心、肝經', fx:'活血通經，散瘀止痛', zz:'經閉痛經，產後瘀滯，癥瘕積聚，胸痹心痛，瘀滯腹痛，胸脅刺痛，跌撲損傷，瘡瘍腫痛', dose:'3-9g', contra:'孕婦忌用；月經過多者慎用', combo:'配桃仁活血祛瘀（桃紅四物湯）；配川芎行氣活血；配當歸養血活血' },
  { id:37, zh:'柏子仁', py:'baiziren', en:'Biota Seed', cat:'安神', prop:'性平，味甘', mer:'歸心、腎、大腸經', fx:'養心安神，潤腸通便，止汗', zz:'虛煩失眠，心悸怔忡，陰虛盜汗，腸燥便秘', dose:'9-15g', contra:'便溏及痰多者慎用', combo:'配酸棗仁養心安神；配五味子、人參益氣安神（天王補心丹）' },
  { id:38, zh:'半夏', py:'banxia', en:'Pinellia Tuber', cat:'止咳', prop:'性溫，味辛', mer:'歸脾、胃、肺經', fx:'燥濕化痰，降逆止嘔，消痞散結', zz:'濕痰寒痰，咳喘痰多，痰飲眩悸，風痰眩暈，嘔吐反胃，胸脘痞悶，梅核氣', dose:'3-9g，一般用法夏或姜半夏', contra:'陰虛燥咳、血證、熱痰者慎用；反烏頭；孕婦慎用', combo:'配陳皮燥濕化痰（二陳湯）；配黃連治嘔吐（半夏瀉心湯）；配厚朴治梅核氣' },
  { id:39, zh:'薏苡仁', py:'yiyiren', en:'Coix Seed', cat:'利水', prop:'性涼，味甘淡', mer:'歸脾、胃、肺經', fx:'利水滲濕，健脾止瀉，除痹，排膿，解毒散結', zz:'水腫，腳氣，小便不利，脾虛泄瀉，濕痹拘攣，肺癰腸癰，贅疣', dose:'9-30g', contra:'孕婦慎用；津液不足者慎用', combo:'配白朮健脾利濕；配附子除濕止痛（薏苡附子散）；配蒼朮祛濕' },
  { id:40, zh:'麥芽', py:'maiya', en:'Malt', cat:'消食', prop:'性平，味甘', mer:'歸脾、胃、肝經', fx:'行氣消食，健脾開胃，回乳消脹', zz:'食積不消，脘腹脹痛，脾虛食少，乳汁鬱積，乳房脹痛，婦女斷乳', dose:'9-15g；回乳炒用60g', contra:'哺乳期婦女不宜大量使用', combo:'配山楂、神麯消食導滯（保和丸）；配穀芽健脾和胃' },
];

export default function HerbWiki({ showToast, user }) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('全部');
  const [favs, setFavs] = useState(loadFavs);
  const [selected, setSelected] = useState(null);
  const [showFavOnly, setShowFavOnly] = useState(false);

  const filtered = useMemo(() => {
    let list = HERBS;
    if (showFavOnly) list = list.filter(h => favs.includes(h.id));
    if (catFilter !== '全部') list = list.filter(h => h.cat === catFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(h => h.zh.includes(q) || h.py.toLowerCase().includes(q) || h.en.toLowerCase().includes(q) || h.fx.includes(q) || h.zz.includes(q));
    }
    return list;
  }, [search, catFilter, favs, showFavOnly]);

  const toggleFav = (id) => {
    const next = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id];
    setFavs(next);
    saveFavs(next);
    showToast?.(favs.includes(id) ? '已取消收藏' : '已加入收藏');
  };

  const printHerb = (herb) => {
    const w = window.open('', '_blank', 'width=600,height=800');
    if (!w) return showToast?.('無法開啟列印視窗，請允許彈出視窗');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(herb.zh)} - 中藥百科</title>
<style>body{font-family:"Microsoft JhengHei","PingFang TC",sans-serif;padding:30px;color:#222;max-width:540px;margin:0 auto}
h1{color:${ACCENT};font-size:22px;border-bottom:2px solid ${ACCENT};padding-bottom:8px;margin-bottom:4px}
.sub{color:#666;font-size:13px;margin-bottom:16px}.section{margin-bottom:12px}
.label{font-weight:bold;color:${ACCENT};font-size:13px;margin-bottom:2px}.val{font-size:14px;line-height:1.6}
.footer{margin-top:24px;padding-top:12px;border-top:1px solid #ddd;font-size:11px;color:#999;text-align:center}
@media print{body{padding:15px}}</style></head><body>
<h1>${escapeHtml(herb.zh)}（${escapeHtml(herb.py)}）</h1><div class="sub">${escapeHtml(herb.en)} ─ ${escapeHtml(herb.cat)}</div>
<div class="section"><div class="label">性味歸經</div><div class="val">${escapeHtml(herb.prop)}　${escapeHtml(herb.mer)}</div></div>
<div class="section"><div class="label">功效</div><div class="val">${escapeHtml(herb.fx)}</div></div>
<div class="section"><div class="label">主治</div><div class="val">${escapeHtml(herb.zz)}</div></div>
<div class="section"><div class="label">用法用量</div><div class="val">${escapeHtml(herb.dose)}</div></div>
<div class="section"><div class="label">禁忌</div><div class="val">${escapeHtml(herb.contra)}</div></div>
<div class="section"><div class="label">常用配伍</div><div class="val">${escapeHtml(herb.combo)}</div></div>
<div class="footer">康晴診所 ─ 中藥百科 ─ 僅供臨床參考</div>
<script>window.onload=()=>window.print();<\/script></body></html>`);
    w.document.close();
  };

  const s = {
    wrap: { padding: 20, maxWidth: 1100, margin: '0 auto' },
    hdr: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
    title: { fontSize: 22, fontWeight: 700, color: ACCENT, margin: 0 },
    search: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, width: 260, outline: 'none' },
    cats: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
    catBtn: (active) => ({ padding: '5px 14px', borderRadius: 20, border: `1px solid ${active ? ACCENT : '#d1d5db'}`, background: active ? ACCENT : '#fff', color: active ? '#fff' : '#374151', fontSize: 13, cursor: 'pointer', fontWeight: active ? 600 : 400, transition: 'all .15s' }),
    favBtn: { padding: '5px 14px', borderRadius: 20, border: `1px solid ${showFavOnly ? '#f59e0b' : '#d1d5db'}`, background: showFavOnly ? '#fef3c7' : '#fff', color: showFavOnly ? '#b45309' : '#374151', fontSize: 13, cursor: 'pointer', fontWeight: showFavOnly ? 600 : 400 },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 },
    card: (sel) => ({ background: sel ? '#f0fdfa' : '#fff', border: `1px solid ${sel ? ACCENT : '#e5e7eb'}`, borderRadius: 10, padding: 14, cursor: 'pointer', transition: 'all .15s', boxShadow: sel ? `0 0 0 2px ${ACCENT}33` : '0 1px 3px rgba(0,0,0,.06)' }),
    cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
    zhName: { fontSize: 17, fontWeight: 700, color: '#111' },
    pyName: { fontSize: 12, color: '#6b7280', marginLeft: 6 },
    enName: { fontSize: 12, color: '#9ca3af', display: 'block', marginTop: 2 },
    badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, background: '#e0f2fe', color: ACCENT, fontSize: 11, fontWeight: 600 },
    star: (active) => ({ cursor: 'pointer', fontSize: 18, color: active ? '#f59e0b' : '#d1d5db', background: 'none', border: 'none', padding: 0, lineHeight: 1 }),
    fxText: { fontSize: 13, color: '#4b5563', lineHeight: 1.5, marginTop: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
    detail: { background: '#fff', border: `1px solid ${ACCENT}44`, borderRadius: 12, padding: 20, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,.06)' },
    detHdr: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 },
    detTitle: { fontSize: 22, fontWeight: 700, color: ACCENT },
    detSub: { fontSize: 14, color: '#6b7280' },
    section: { marginBottom: 12 },
    secLabel: { fontSize: 13, fontWeight: 700, color: ACCENT, marginBottom: 2 },
    secVal: { fontSize: 14, color: '#374151', lineHeight: 1.7 },
    btnRow: { display: 'flex', gap: 8, marginTop: 8 },
    btn: (bg) => ({ padding: '6px 16px', borderRadius: 8, border: 'none', background: bg, color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }),
    closeBtn: { padding: '6px 16px', borderRadius: 8, border: `1px solid #d1d5db`, background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer' },
    empty: { textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 15 },
    count: { fontSize: 13, color: '#6b7280', marginBottom: 10 },
  };

  return (
    <div style={s.wrap}>
      <div style={s.hdr}>
        <h2 style={s.title}>中藥百科</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input style={s.search} placeholder="搜尋：藥名、拼音、功效⋯" value={search} onChange={e => setSearch(e.target.value)} />
          <button style={s.favBtn} onClick={() => setShowFavOnly(!showFavOnly)}>{showFavOnly ? '★ 收藏中' : '☆ 收藏'}</button>
        </div>
      </div>

      <div style={s.cats}>
        {CATEGORIES.map(c => (
          <button key={c} style={s.catBtn(catFilter === c)} onClick={() => setCatFilter(c)}>{c}</button>
        ))}
      </div>

      {selected && (() => {
        const h = HERBS.find(x => x.id === selected);
        if (!h) return null;
        return (
          <div style={s.detail}>
            <div style={s.detHdr}>
              <div>
                <div style={s.detTitle}>{h.zh}<span style={{ fontSize: 14, fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>{h.py}</span></div>
                <div style={s.detSub}>{h.en} ─ <span style={s.badge}>{h.cat}</span></div>
              </div>
              <button style={s.star(favs.includes(h.id))} onClick={() => toggleFav(h.id)} title={favs.includes(h.id) ? '取消收藏' : '加入收藏'}>
                {favs.includes(h.id) ? '★' : '☆'}
              </button>
            </div>
            <div style={s.section}><div style={s.secLabel}>性味歸經</div><div style={s.secVal}>{h.prop}　{h.mer}</div></div>
            <div style={s.section}><div style={s.secLabel}>功效</div><div style={s.secVal}>{h.fx}</div></div>
            <div style={s.section}><div style={s.secLabel}>主治</div><div style={s.secVal}>{h.zz}</div></div>
            <div style={s.section}><div style={s.secLabel}>用法用量</div><div style={s.secVal}>{h.dose}</div></div>
            <div style={s.section}><div style={s.secLabel}>禁忌</div><div style={s.secVal}>{h.contra}</div></div>
            <div style={s.section}><div style={s.secLabel}>常用配伍</div><div style={s.secVal}>{h.combo}</div></div>
            <div style={s.btnRow}>
              <button style={s.btn(ACCENT)} onClick={() => printHerb(h)}>列印藥材卡</button>
              <button style={s.closeBtn} onClick={() => setSelected(null)}>關閉</button>
            </div>
          </div>
        );
      })()}

      <div style={s.count}>共 {filtered.length} 味藥材{showFavOnly ? '（僅顯示收藏）' : ''}</div>

      {filtered.length === 0 ? (
        <div style={s.empty}>{showFavOnly ? '尚無收藏藥材' : '找不到符合條件的藥材'}</div>
      ) : (
        <div style={s.grid}>
          {filtered.map(h => (
            <div key={h.id} style={s.card(selected === h.id)} onClick={() => setSelected(h.id)}>
              <div style={s.cardTop}>
                <div>
                  <span style={s.zhName}>{h.zh}</span><span style={s.pyName}>{h.py}</span>
                  <span style={s.enName}>{h.en}</span>
                </div>
                <button style={s.star(favs.includes(h.id))} onClick={e => { e.stopPropagation(); toggleFav(h.id); }}>
                  {favs.includes(h.id) ? '★' : '☆'}
                </button>
              </div>
              <span style={s.badge}>{h.cat}</span>
              <div style={s.fxText}>{h.fx}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
