/* ======== EDIT HERE: gym name, phone, plans, classes — used by the website and the member portal ======== */
window.GYM = {
  name: 'Iron Pulse Gym',
  phone: '919571930793',            // WhatsApp / call number with country code, digits only
  phoneLabel: '+91 95719 30793',    // how the number is shown on the page
  address: 'Main Road, near Bus Stand, Ranivara, Rajasthan',
  mapQuery: 'Ranivara,Rajasthan',
  hours: [['5:00 AM – 11:00 PM', 'Monday – Saturday'], ['6:00 AM – 12:00 PM', 'Sunday']],

  // [name, monthly price, features (prefix "-" = not included), most popular?]
  plans: [
    ['Basic', 999, ['Full gym floor access', 'Locker & shower', 'Free fitness assessment', '-Group classes', '-Personal trainer'], 0],
    ['Pro', 1499, ['Everything in Basic', 'All group classes', 'Monthly diet chart', 'Progress check every month', '-Personal trainer'], 1],
    ['Elite', 2999, ['Everything in Pro', 'Personal trainer (12 sessions/mo)', 'Custom diet & workout plan', 'Body-composition analysis', 'Priority slot booking'], 0]
  ],
  discount: { 1: 0, 3: 0.10, 6: 0.15, 12: 0.25 },   // months → discount
  batches: ['Morning (5–10 AM)', 'Afternoon (12–4 PM)', 'Evening (5–11 PM)', 'Ladies batch'],

  days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  classes: { // [time, class, trainer, tag]
    Mon: [['6:00 AM', 'Yoga Flow', 'Neha', ''], ['7:30 AM', 'HIIT Burn', 'Aman', 'Popular'], ['6:00 PM', 'Strength Basics', 'Vikram', ''], ['7:30 PM', 'Zumba', 'Neha', 'Popular']],
    Tue: [['6:00 AM', 'CrossFit', 'Aman', ''], ['7:00 AM', 'Ladies Toning', 'Neha', 'Ladies'], ['6:30 PM', 'Power Yoga', 'Neha', ''], ['8:00 PM', 'Core Blast', 'Karan', '']],
    Wed: [['6:00 AM', 'Yoga Flow', 'Neha', ''], ['7:30 AM', 'HIIT Burn', 'Aman', 'Popular'], ['6:00 PM', 'Deadlift Clinic', 'Vikram', ''], ['7:30 PM', 'Zumba', 'Neha', 'Popular']],
    Thu: [['6:00 AM', 'CrossFit', 'Aman', ''], ['7:00 AM', 'Ladies Toning', 'Neha', 'Ladies'], ['6:30 PM', 'Functional Fit', 'Karan', ''], ['8:00 PM', 'Core Blast', 'Karan', '']],
    Fri: [['6:00 AM', 'Yoga Flow', 'Neha', ''], ['7:30 AM', 'HIIT Burn', 'Aman', 'Popular'], ['6:00 PM', 'Strength Basics', 'Vikram', ''], ['7:30 PM', 'Zumba Party', 'Neha', 'Popular']],
    Sat: [['7:00 AM', 'Bootcamp', 'Aman', 'Popular'], ['9:00 AM', 'Stretch & Mobility', 'Neha', ''], ['6:00 PM', 'Open Lifting', 'Vikram', '']],
    Sun: [['7:00 AM', 'Community Run', 'Aman', 'Free'], ['9:00 AM', 'Yoga & Meditation', 'Neha', '']]
  }
};
