// Cấu hình dựng 10 tuyến từ dữ liệu mở: điểm đi qua -> chỉ đường OSM (Valhalla) -> độ cao SRTM 30 m.
// Khi có GPX chính thức của ban tổ chức, đặt vào gpx/<id>.gpx rồi chạy `npm run courses:gpx` để thay thế.
// costing: 'pedestrian' (phố đi bộ) hoặc 'auto' (đường đèo, cầu); maxKm: cắt tuyến; bridges: nội suy thẳng độ cao qua cầu/hầm (km).
export const COURSES = {
  hoguom: { maxGrade: 5, costing: 'pedestrian', via: [[21.03073, 105.85238], [21.0291, 105.8502], [21.0255, 105.8522], [21.0283, 105.8547], [21.0317, 105.8531], [21.04314, 105.85817]],
    landmarks: { thaprua: [21.02876, 105.85227] }, features: { lake: [21.0288, 105.8522] } },
  saigon: { maxGrade: 5, costing: 'pedestrian', via: [[10.77541, 106.70014], [10.77186, 106.70446], [10.78188, 106.70674], [10.79696, 106.75045]],
    landmarks: { bitexco: [10.77186, 106.70446], landmark81: [10.79696, 106.75045] }, features: { river: [10.7735, 106.7088] } },
  danang: { maxGrade: 6, costing: 'auto', via: [[16.06117, 108.2279], [16.07563, 108.24688], [16.0935, 108.2528]], landmarks: { caurong: [16.06117, 108.2279] } },
  halong: { maxGrade: 8, costing: 'auto', via: [[20.9525, 107.0655], [20.96016, 107.06579], [20.96846, 107.0777]], bridges: [[0.3, 1.4]] },
  trangan: { maxGrade: 8, costing: 'auto', via: [[20.25269, 105.91808], [20.27284, 105.86403]], landmarks: { baidinh: [20.27284, 105.86403] } },
  mocchau: { maxGrade: 9, costing: 'auto', via: [[20.84499, 104.64099], [20.81798, 104.59169]] },
  haivan: { maxGrade: 9, costing: 'auto', via: [[16.10978, 108.12374], [16.18775, 108.13129]], landmarks: { haivanquan: [16.18775, 108.13129] } },
  prenn: { maxGrade: 12, costing: 'auto', via: [[11.87652, 108.4701], [11.91574, 108.44739]] },
  oquyho: { maxGrade: 14, costing: 'auto', via: [[22.3363, 103.844], [22.37238, 103.75714]] },
  mapileng: { maxGrade: 14, costing: 'auto', via: [[23.24196, 105.39792], [23.16332, 105.41044]], maxKm: 9 }
};
