export const calculateBonusPoints = (formTypeId: number, product_quantity: number): number => {
  let bonus_points = 0;

  if (formTypeId === 1) {
    if (product_quantity >= 1 && product_quantity <= 50) {
      bonus_points = 10;
    } else if (product_quantity > 50 && product_quantity <= 300) {
      bonus_points = 20;
    } else if (product_quantity > 300) {
      bonus_points = 40;
    }
  } else if (formTypeId === 4) {
    if (product_quantity >= 1 && product_quantity <= 50) {
      bonus_points = 20;
    } else if (product_quantity > 50 && product_quantity <= 300) {
      bonus_points = 50;
    } else if (product_quantity > 300) {
      bonus_points = 100;
    }
  } else if (formTypeId === 5) {
    if (product_quantity >= 1 && product_quantity <= 50) {
      bonus_points = 50;
    } else if (product_quantity > 50 && product_quantity <= 300) {
      bonus_points = 100;
    } else if (product_quantity > 300) {
      bonus_points = 200;
    }
  } else if (formTypeId === 6) {
    if (product_quantity >= 1 && product_quantity <= 50) {
      bonus_points = 100;
    } else if (product_quantity > 50 && product_quantity <= 300) {
      bonus_points = 200;
    } else if (product_quantity > 300) {
      bonus_points = 400;
    }
  } else if (formTypeId === 7) {
    if (product_quantity >= 1 && product_quantity <= 50) {
      bonus_points = 5;
    } else if (product_quantity > 50 && product_quantity <= 300) {
      bonus_points = 10;
    } else if (product_quantity > 300) {
      bonus_points = 20;
    }
  } else if (formTypeId === 8) {
    if (product_quantity >= 1 && product_quantity <= 50) {
      bonus_points = 10;
    } else if (product_quantity > 50 && product_quantity <= 300) {
      bonus_points = 25;
    } else if (product_quantity > 300) {
      bonus_points = 50;
    }
  } else if (formTypeId === 9) {
    if (product_quantity >= 1 && product_quantity <= 50) {
      bonus_points = 25;
    } else if (product_quantity > 50 && product_quantity <= 300) {
      bonus_points = 50;
    } else if (product_quantity > 300) {
      bonus_points = 100;
    }
  } else if (formTypeId === 10) {
    if (product_quantity >= 1 && product_quantity <= 50) {
      bonus_points = 50;
    } else if (product_quantity > 50 && product_quantity <= 300) {
      bonus_points = 100;
    } else if (product_quantity > 300) {
      bonus_points = 200;
    }
  }

  return bonus_points;
}; 