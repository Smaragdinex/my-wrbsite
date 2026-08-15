// 每一關的「標準桿」與實際發給玩家的配給。由 tools/par.js 產生,不要手改。
//
// par   = 最少要用幾片才過得了關,也就是三星的門檻。這是用逐步加深搜出來的
//         真正下限,不是估的 —— 估高了三星就變成用送的。
// stock = 實際發給玩家的量,比標準桿寬鬆。多出來的是繞路的餘裕:
//         繞遠路照樣過得了關,只是拿不到三星。
//
// 星等:用掉的片數 <= par 三星,<= par + STAR_SLACK 兩星,再多一星。
export const STAR_SLACK = 3

export const PAR = [
    { par:  3, stock: { straight: 5 } },                      //  1. 第一班車
    { par:  4, stock: { straight: 4, curve: 4 } },            //  2. 轉個彎
    { par:  6, stock: { straight: 4, curve: 6 } },            //  3. 繞過石頭
    { par:  5, stock: { straight: 3, curve: 6 } },            //  4. 順道載客
    { par:  7, stock: { straight: 5, curve: 6 } },            //  5. S 形
    { par: 12, stock: { straight: 6, curve: 12 } },           //  6. 兩位乘客
    { par: 11, stock: { straight: 9, curve: 8 } },            //  7. 石頭陣
    { par:  7, stock: { straight: 5, curve: 5, cross: 3 } },  //  8. 交叉
    { par: 16, stock: { straight: 18, curve: 6 } },           //  9. 長途
    { par: 13, stock: { straight: 8, curve: 11, cross: 3 } }, // 10. 總站
    { par: 13, stock: { straight: 9, curve: 11 } },           // 11. 長彎
    { par: 14, stock: { straight: 9, curve: 12 } },           // 12. 兩頭跑
    { par: 14, stock: { curve: 11, straight: 9, cross: 3 } }, // 13. 穿過去
    { par: 15, stock: { straight: 11, cross: 3, curve: 11 } },// 14. 繞遠路
    { par: 16, stock: { curve: 14, straight: 9, cross: 3 } }, // 15. 三個人
    { par: 17, stock: { curve: 17, straight: 8, cross: 3 } }, // 16. 大迴圈
    { par: 17, stock: { curve: 14, straight: 11, cross: 3 } },// 17. 回頭路
    { par: 17, stock: { cross: 4, straight: 9, curve: 14 } }, // 18. 滿載
    { par: 20, stock: { straight: 15, curve: 14, cross: 3 } },// 19. 長途二號
    { par: 21, stock: { straight: 17, cross: 4, curve: 12 } },// 20. 總站二號
    { par: 15, stock: { straight: 9, curve: 12, cross: 3 } }, // 21. 寬一點
    { par: 15, stock: { curve: 18, straight: 6, cross: 3 } }, // 22. 雙十字
    { par: 18, stock: { cross: 4, straight: 8, curve: 17 } }, // 23. 四個人
    { par: 19, stock: { straight: 9, cross: 4, curve: 17 } }, // 24. 滿場跑
    { par: 20, stock: { cross: 4, straight: 15, curve: 12 } },// 25. 三次交會
    { par: 21, stock: { curve: 15, straight: 14, cross: 4 } },// 26. 大場地
    { par: 23, stock: { curve: 18, straight: 15, cross: 3 } },// 27. 繞三圈
    { par: 22, stock: { cross: 4, straight: 15, curve: 17 } },// 28. 長班車
    { par: 25, stock: { curve: 21, cross: 3, straight: 15 } },// 29. 大迴圈二號
    { par: 26, stock: { curve: 21, straight: 17, cross: 3 } },// 30. 大調度
    { par: 15, stock: { straight: 6, curve: 15, bridge: 3 } },// 31. 過河
    { par: 16, stock: { curve: 14, straight: 8, cross: 3, bridge: 3 } },// 32. 一座橋
    { par: 18, stock: { straight: 11, cross: 3, curve: 12, bridge: 4 } },// 33. 兩次過河
    { par: 19, stock: { straight: 8, curve: 18, cross: 3, bridge: 3 } },// 34. 對岸的人
    { par: 20, stock: { straight: 11, curve: 15, cross: 4, bridge: 3 } },// 35. 橋與交叉
    { par: 22, stock: { curve: 17, cross: 3, straight: 14, bridge: 3 } },// 36. 三座橋
    { par: 23, stock: { curve: 14, straight: 17, cross: 3, bridge: 4 } },// 37. 沿河走
    { par: 23, stock: { curve: 23, straight: 8, cross: 3, bridge: 5 } },// 38. 大河工程
    { par: 23, stock: { straight: 11, cross: 5, curve: 17, bridge: 4 } },// 39. 總調度
    { par: 26, stock: { curve: 20, straight: 15, cross: 3, bridge: 4 } },// 40. 總站四號
    { par: 19, stock: { curve: 21, straight: 3, cross: 5, bridge: 3 } },// 41. 三重交會
    { par: 20, stock: { cross: 5, curve: 17, straight: 6, bridge: 4 } },// 42. 雙橋三叉
    { par: 21, stock: { curve: 18, straight: 8, cross: 5, bridge: 3 } },// 43. 纏繞
    { par: 21, stock: { cross: 6, curve: 21, straight: 4, bridge: 3 } },// 44. 四次交會
    { par: 22, stock: { cross: 6, curve: 20, straight: 6, bridge: 3 } },// 45. 大纏繞
    { par: 22, stock: { curve: 20, cross: 6, straight: 5, bridge: 4 } },// 46. 雙橋四叉
    { par: 23, stock: { cross: 6, straight: 8, curve: 20, bridge: 3 } },// 47. 總工程
    { par: 24, stock: { straight: 9, curve: 18, cross: 6, bridge: 4 } },// 48. 迷宮線
    { par: 25, stock: { cross: 6, curve: 21, straight: 9, bridge: 3 } },// 49. 長河大線
    { par: 26, stock: { curve: 23, cross: 6, straight: 8, bridge: 4 } },// 50. 終點站
]
